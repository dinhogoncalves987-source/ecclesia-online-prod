/**
 * src/reviewMode/mockQueryBuilder.ts
 *
 * Motor de consulta em memória que imita, de forma deliberadamente
 * simplificada, a API encadeável do query builder do `@supabase/supabase-js`
 * (`.select().eq().order().limit()...`). Existe para que as páginas reais do
 * Ecclesia consumam `supabase.from(tabela)` sem nenhuma alteração enquanto o
 * Modo Avaliação estiver ativo.
 *
 * Não é (e não precisa ser) uma reimplementação fiel do PostgREST — cobre os
 * operadores realmente usados no código do projeto. Qualquer filtro
 * desconhecido é ignorado (nunca lança), o que é uma simplificação aceitável
 * para um ambiente de demonstração com dados fictícios.
 */

import { notifyReviewSimulatedAction } from "./reviewToast";

export type ReviewRow = Record<string, unknown>;

export interface ReviewTableStore {
  getTable(name: string): ReviewRow[];
  insertRows(name: string, rows: ReviewRow[]): ReviewRow[];
  updateRows(name: string, patch: ReviewRow, matched: ReviewRow[]): ReviewRow[];
  deleteRows(name: string, matched: ReviewRow[]): void;
}

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "like" | "ilike";

interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

export interface MockResult<T = ReviewRow[] | ReviewRow | null> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number;
}

/** Relações simples "tabela.select('rel(col1,col2)')" usadas no projeto. */
const EMBED_RELATIONS: Record<string, Record<string, { localKey: string; table: string; foreignKey: string }>> = {
  schedule_assignments: {
    members: { localKey: "member_id", table: "members", foreignKey: "id" },
  },
  group_members: {
    members: { localKey: "member_id", table: "members", foreignKey: "id" },
  },
};

function matchValue(rowValue: unknown, op: FilterOp, filterValue: unknown): boolean {
  switch (op) {
    case "eq":
      return rowValue === filterValue;
    case "neq":
      return rowValue !== filterValue;
    case "gt":
      return typeof rowValue === "number" || typeof rowValue === "string"
        ? rowValue > (filterValue as never)
        : false;
    case "gte":
      return typeof rowValue === "number" || typeof rowValue === "string"
        ? rowValue >= (filterValue as never)
        : false;
    case "lt":
      return typeof rowValue === "number" || typeof rowValue === "string"
        ? rowValue < (filterValue as never)
        : false;
    case "lte":
      return typeof rowValue === "number" || typeof rowValue === "string"
        ? rowValue <= (filterValue as never)
        : false;
    case "in":
      return Array.isArray(filterValue) && filterValue.includes(rowValue);
    case "is":
      return rowValue === filterValue;
    case "like":
    case "ilike": {
      if (typeof rowValue !== "string" || typeof filterValue !== "string") return false;
      const pattern = filterValue.replace(/%/g, "").toLowerCase();
      return rowValue.toLowerCase().includes(pattern);
    }
    default:
      return true;
  }
}

export class MockQueryBuilder implements PromiseLike<MockResult> {
  private filters: Filter[] = [];
  private orderColumn: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private mode: Mode = "select";
  private payload: ReviewRow | ReviewRow[] | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private headOnly = false;
  private embedNames: string[] = [];

  constructor(
    private readonly table: string,
    private readonly store: ReviewTableStore,
  ) {}

  select(columns?: string, options?: { head?: boolean; count?: string }): this {
    if (options?.head) this.headOnly = true;
    if (columns) {
      const embedMatches = columns.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
      for (const match of embedMatches) this.embedNames.push(match[1]);
    }
    return this;
  }

  private addFilter(column: string, op: FilterOp, value: unknown): this {
    this.filters.push({ column, op, value });
    return this;
  }

  eq(column: string, value: unknown) { return this.addFilter(column, "eq", value); }
  neq(column: string, value: unknown) { return this.addFilter(column, "neq", value); }
  gt(column: string, value: unknown) { return this.addFilter(column, "gt", value); }
  gte(column: string, value: unknown) { return this.addFilter(column, "gte", value); }
  lt(column: string, value: unknown) { return this.addFilter(column, "lt", value); }
  lte(column: string, value: unknown) { return this.addFilter(column, "lte", value); }
  in(column: string, values: unknown[]) { return this.addFilter(column, "in", values); }
  is(column: string, value: unknown) { return this.addFilter(column, "is", value); }
  like(column: string, value: unknown) { return this.addFilter(column, "like", value); }
  ilike(column: string, value: unknown) { return this.addFilter(column, "ilike", value); }
  /** Simplificação deliberada: `.or(...)` nunca restringe resultados no mock. */
  or(_expression: string) { return this; }
  not(_column: string, _op: string, _value: unknown) { return this; }
  contains(_column: string, _value: unknown) { return this; }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAscending = options?.ascending !== false;
    return this;
  }
  limit(n: number) { this.limitCount = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybeSingle"; return this; }

  insert(rows: ReviewRow | ReviewRow[]) {
    this.mode = "insert";
    this.payload = rows;
    return this;
  }

  update(patch: ReviewRow) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }

  upsert(rows: ReviewRow | ReviewRow[]) {
    this.mode = "upsert";
    this.payload = rows;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  private matches(row: ReviewRow): boolean {
    return this.filters.every((f) => matchValue(row[f.column], f.op, f.value));
  }

  private attachEmbeds(rows: ReviewRow[]): ReviewRow[] {
    if (this.embedNames.length === 0) return rows;
    const relations = EMBED_RELATIONS[this.table];
    if (!relations) return rows;
    return rows.map((row) => {
      const next: ReviewRow = { ...row };
      for (const embedName of this.embedNames) {
        const relation = relations[embedName];
        if (!relation) continue;
        const foreignRows = this.store.getTable(relation.table);
        const localValue = row[relation.localKey];
        next[embedName] = foreignRows.find((fr) => fr[relation.foreignKey] === localValue) ?? null;
      }
      return next;
    });
  }

  private async execute(): Promise<MockResult> {
    if (this.mode === "insert" || this.mode === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      const inserted = this.store.insertRows(this.table, rows);
      notifyReviewSimulatedAction(this.mode === "insert" ? "criação de registro" : "criação/atualização de registro");
      return this.finalize(inserted);
    }

    if (this.mode === "update") {
      const table = this.store.getTable(this.table);
      const matched = table.filter((row) => this.matches(row));
      const updated = this.store.updateRows(this.table, (this.payload as ReviewRow) ?? {}, matched);
      notifyReviewSimulatedAction("atualização de registro");
      return this.finalize(updated);
    }

    if (this.mode === "delete") {
      const table = this.store.getTable(this.table);
      const matched = table.filter((row) => this.matches(row));
      this.store.deleteRows(this.table, matched);
      notifyReviewSimulatedAction("exclusão de registro");
      return this.finalize(matched);
    }

    // select
    let rows = this.store.getTable(this.table).filter((row) => this.matches(row));
    if (this.orderColumn) {
      const col = this.orderColumn;
      const dir = this.orderAscending ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = a[col] as string | number | null | undefined;
        const bv = b[col] as string | number | null | undefined;
        if (av == null && bv == null) return 0;
        if (av == null) return -1 * dir;
        if (bv == null) return 1 * dir;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    if (this.rangeFrom != null) {
      const to = this.rangeTo != null ? this.rangeTo + 1 : rows.length;
      rows = rows.slice(this.rangeFrom, to);
    }
    if (this.limitCount != null) {
      rows = rows.slice(0, this.limitCount);
    }
    rows = this.attachEmbeds(rows);
    return this.finalize(rows);
  }

  private finalize(rows: ReviewRow[]): MockResult {
    if (this.headOnly) {
      return { data: null, error: null, count: rows.length };
    }
    if (this.singleMode === "single") {
      const row = rows[0];
      return row
        ? { data: row, error: null }
        : { data: null, error: { message: "Registro não encontrado (modo avaliação)", code: "PGRST116" } };
    }
    if (this.singleMode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null, count: rows.length };
  }

  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
