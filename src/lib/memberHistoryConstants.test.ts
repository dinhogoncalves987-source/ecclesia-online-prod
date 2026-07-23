import { describe, it, expect } from "vitest";
import {
  HISTORY_TYPES, HISTORY_TYPE_LABELS,
  OCCURRENCE_TYPES, OCCURRENCE_TYPE_LABELS, SENSITIVE_OCCURRENCE_TYPES,
  OCCURRENCE_STATUSES, OCCURRENCE_STATUS_LABELS,
  ORDINATION_TYPES, ORDINATION_TYPE_LABELS, ORDINATION_STATUSES, ORDINATION_STATUS_LABELS,
  TRANSFER_DIRECTIONS, TRANSFER_DIRECTION_LABELS,
  TRANSFER_LOCATION_TYPES, TRANSFER_LOCATION_TYPE_LABELS,
  TRANSFER_STATUSES, TRANSFER_STATUS_LABELS,
  ORG_LINK_TYPES, ORG_LINK_TYPE_LABELS,
  VISIBILITY_OPTIONS, VISIBILITY_LABELS,
} from "./memberHistoryConstants";

describe("memberHistoryConstants", () => {
  it("todo HISTORY_TYPES tem um rótulo em HISTORY_TYPE_LABELS", () => {
    for (const type of HISTORY_TYPES) {
      expect(HISTORY_TYPE_LABELS[type], `sem rótulo para ${type}`).toBeTruthy();
    }
  });

  it("todo OCCURRENCE_TYPES tem rótulo e nenhum tipo sensível está fora do catálogo", () => {
    for (const type of OCCURRENCE_TYPES) {
      expect(OCCURRENCE_TYPE_LABELS[type], `sem rótulo para ${type}`).toBeTruthy();
    }
    for (const sensitive of SENSITIVE_OCCURRENCE_TYPES) {
      expect(OCCURRENCE_TYPES as readonly string[]).toContain(sensitive);
    }
  });

  it("todo OCCURRENCE_STATUSES tem rótulo", () => {
    for (const status of OCCURRENCE_STATUSES) {
      expect(OCCURRENCE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("todo ORDINATION_TYPES/ORDINATION_STATUSES tem rótulo", () => {
    for (const type of ORDINATION_TYPES) expect(ORDINATION_TYPE_LABELS[type]).toBeTruthy();
    for (const status of ORDINATION_STATUSES) expect(ORDINATION_STATUS_LABELS[status]).toBeTruthy();
  });

  it("todo TRANSFER_* tem rótulo", () => {
    for (const d of TRANSFER_DIRECTIONS) expect(TRANSFER_DIRECTION_LABELS[d]).toBeTruthy();
    for (const l of TRANSFER_LOCATION_TYPES) expect(TRANSFER_LOCATION_TYPE_LABELS[l]).toBeTruthy();
    for (const s of TRANSFER_STATUSES) expect(TRANSFER_STATUS_LABELS[s]).toBeTruthy();
  });

  it("todo ORG_LINK_TYPES tem rótulo e corresponde às 3 colunas rastreáveis de members", () => {
    expect(ORG_LINK_TYPES).toEqual(["organization", "sector", "congregation"]);
    for (const l of ORG_LINK_TYPES) expect(ORG_LINK_TYPE_LABELS[l]).toBeTruthy();
  });

  it("VISIBILITY_OPTIONS tem exatamente normal/confidential com rótulos", () => {
    expect(VISIBILITY_OPTIONS).toEqual(["normal", "confidential"]);
    for (const v of VISIBILITY_OPTIONS) expect(VISIBILITY_LABELS[v]).toBeTruthy();
  });

  it("nenhum catálogo referencia rede social externa", () => {
    const allLabels = [
      ...Object.values(HISTORY_TYPE_LABELS),
      ...Object.values(OCCURRENCE_TYPE_LABELS),
      ...Object.values(ORDINATION_TYPE_LABELS),
      ...Object.values(TRANSFER_STATUS_LABELS),
    ].join(" ");
    expect(/facebook|instagram|tiktok|twitter|linkedin/i.test(allLabels)).toBe(false);
  });
});
