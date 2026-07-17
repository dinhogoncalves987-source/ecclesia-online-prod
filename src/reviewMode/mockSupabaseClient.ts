/**
 * src/reviewMode/mockSupabaseClient.ts
 *
 * Cliente Supabase 100% em memória usado exclusivamente pelo Modo Avaliação
 * (ver `src/config/reviewMode.ts`). Nunca abre uma conexão de rede real:
 * toda leitura vem de `src/reviewMode/fixtures.ts`, toda escrita altera
 * apenas a cópia em memória desta aba (perdida ao recarregar a página) e
 * dispara a notificação padrão de "ação simulada".
 *
 * Implementa apenas a fração da API do `@supabase/supabase-js` que o projeto
 * realmente usa: `.from()`, `.rpc()`, `.storage.from()`, `.auth.*`. Qualquer
 * outra chamada cai num fallback seguro (nunca lança, nunca contata rede).
 */

import type { Session, User } from "@supabase/supabase-js";
import { MockQueryBuilder, type ReviewRow, type ReviewTableStore } from "./mockQueryBuilder";
import { notifyReviewSimulatedAction } from "./reviewToast";
import { deactivateReviewModeSession } from "@/config/reviewMode";
import {
  createReviewStoreTables,
  REVIEW_USER_ID,
  uid,
  type ReviewStoreTables,
} from "./fixtures";

// ── "Banco" em memória ──────────────────────────────────────────────────────

class ReviewStore implements ReviewTableStore {
  private tables: ReviewStoreTables = createReviewStoreTables();

  getTable(name: string): ReviewRow[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  insertRows(name: string, rows: ReviewRow[]): ReviewRow[] {
    const table = this.getTable(name);
    const inserted = rows.map((row) => {
      const withDefaults: ReviewRow = {
        id: row.id ?? uid(name),
        created_at: row.created_at ?? new Date().toISOString(),
        ...row,
      };
      table.push(withDefaults);
      return withDefaults;
    });
    return inserted;
  }

  updateRows(_name: string, patch: ReviewRow, matched: ReviewRow[]): ReviewRow[] {
    matched.forEach((row) => {
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
    });
    return matched;
  }

  deleteRows(name: string, matched: ReviewRow[]): void {
    const table = this.getTable(name);
    const matchedIds = new Set(matched.map((r) => r.id));
    const remaining = table.filter((row) => !matchedIds.has(row.id));
    this.tables[name] = remaining;
  }

  /** Reinicia todos os dados fictícios para o estado inicial (nova sessão de avaliação). */
  reset(): void {
    this.tables = createReviewStoreTables();
  }
}

const store = new ReviewStore();

// ── Auth simulada ────────────────────────────────────────────────────────────

const FAKE_USER: User = {
  id: REVIEW_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "avaliacao@ecclesia.local",
  app_metadata: { provider: "review-mode" },
  user_metadata: { full_name: "Administrador Municipal (Avaliação)" },
  created_at: new Date().toISOString(),
} as User;

const FAKE_SESSION: Session = {
  access_token: "review-mode-fake-token",
  refresh_token: "review-mode-fake-refresh-token",
  expires_in: 60 * 60 * 24,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  token_type: "bearer",
  user: FAKE_USER,
} as Session;

type AuthChangeCallback = (event: string, session: Session | null) => void;

let activeSession: Session | null = FAKE_SESSION;
let authListener: AuthChangeCallback | null = null;

function resetReviewAuthSession(): void {
  activeSession = FAKE_SESSION;
}

const mockAuth = {
  getSession: async () => ({ data: { session: activeSession }, error: null }),
  getUser: async () => ({ data: { user: activeSession?.user ?? null }, error: null }),
  onAuthStateChange: (callback: AuthChangeCallback) => {
    authListener = callback;
    queueMicrotask(() => callback("INITIAL_SESSION", activeSession));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authListener = null;
          },
        },
      },
    };
  },
  signOut: async () => {
    activeSession = null;
    deactivateReviewModeSession();
    authListener?.("SIGNED_OUT", null);
    // Restaura a sessão fictícia para a próxima vez que `/avaliacao` for
    // acessado nesta mesma aba (sem exigir reload completo).
    resetReviewAuthSession();
    return { error: null };
  },
  signInWithPassword: async () => ({
    data: { session: null, user: null },
    error: { message: "Login desabilitado no Modo Avaliação.", name: "ReviewModeAuthError" },
  }),
  signInWithOAuth: async () => ({
    data: { provider: "review-mode", url: null },
    error: { message: "Login desabilitado no Modo Avaliação.", name: "ReviewModeAuthError" },
  }),
  updateUser: async () => {
    notifyReviewSimulatedAction("atualização de usuário");
    return { data: { user: activeSession?.user ?? null }, error: null };
  },
  resetPasswordForEmail: async () => ({ data: {}, error: null }),
};

// ── Storage simulado ─────────────────────────────────────────────────────────

const PLACEHOLDER_IMAGE_URL = "https://placehold.co/480x480?text=Avalia%C3%A7%C3%A3o";

function mockStorageFrom(_bucket: string) {
  return {
    upload: async (path: string) => {
      notifyReviewSimulatedAction("upload de arquivo");
      return { data: { path }, error: null };
    },
    update: async (path: string) => {
      notifyReviewSimulatedAction("upload de arquivo");
      return { data: { path }, error: null };
    },
    remove: async () => {
      notifyReviewSimulatedAction("exclusão de arquivo");
      return { data: null, error: null };
    },
    list: async () => ({ data: [], error: null }),
    download: async () => ({
      data: null,
      error: { message: "Download indisponível no Modo Avaliação." },
    }),
    getPublicUrl: (_path: string) => ({ data: { publicUrl: PLACEHOLDER_IMAGE_URL } }),
    createSignedUrl: async () => ({ data: { signedUrl: PLACEHOLDER_IMAGE_URL }, error: null }),
  };
}

// ── RPC simulado ──────────────────────────────────────────────────────────────

type RpcHandler = (args: Record<string, unknown> | undefined) => { data: unknown; error: null };

const RPC_HANDLERS: Record<string, RpcHandler> = {
  get_my_access_capabilities: () => ({ data: [], error: null }),
  get_my_managed_group_ids: () => ({ data: store.getTable("groups").map((g) => g.id), error: null }),
  admin_list_hierarchy_responsibles: () => ({ data: [], error: null }),
  admin_list_organization_access: () => ({ data: [], error: null }),
  admin_list_access_invites: () => ({ data: [], error: null }),
  admin_search_members_for_access: () => ({ data: [], error: null }),
  generate_member_validation_token: (args) => ({
    data: {
      token: `review-token-${uid("wallet")}`,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      member_id: args?._member_id ?? args?.member_id ?? null,
    },
    error: null,
  }),
};

async function mockRpc(fnName: string, args?: Record<string, unknown>) {
  const handler = RPC_HANDLERS[fnName];
  if (handler) return handler(args);

  // Fallback genérico: nomes que sugerem listagem retornam array vazio
  // (evita `.map is not a function` em telas fora do escopo prioritário);
  // qualquer outro nome é tratado como uma ação simulada.
  if (/list|search|get_/i.test(fnName)) {
    return { data: [], error: null };
  }
  notifyReviewSimulatedAction(`chamada administrativa (${fnName})`);
  return { data: { success: true, simulated: true }, error: null };
}

// ── Functions (edge functions) simulado ─────────────────────────────────────

async function mockFunctionsInvoke(functionName: string) {
  notifyReviewSimulatedAction(`função (${functionName})`);
  return { data: { simulated: true }, error: null };
}

// ── Cliente completo ─────────────────────────────────────────────────────────

export function createMockSupabaseClient() {
  return {
    from(table: string) {
      return new MockQueryBuilder(table, store);
    },
    rpc: mockRpc,
    storage: { from: mockStorageFrom },
    auth: mockAuth,
    functions: { invoke: mockFunctionsInvoke },
    channel() {
      return {
        on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        subscribe: () => ({ unsubscribe: () => {} }),
        unsubscribe: () => {},
      };
    },
    removeChannel: () => {},
  };
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
