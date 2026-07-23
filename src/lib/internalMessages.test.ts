import { describe, expect, it } from "vitest";
import { resolveDirectThreadCounterpart } from "./internalMessages";

describe("resolveDirectThreadCounterpart", () => {
  const creator = "00000000-0000-4000-8000-000000000001";
  const target = "00000000-0000-4000-8000-000000000002";

  it("mostra o destinatário para quem iniciou", () => {
    expect(resolveDirectThreadCounterpart({
      currentUserId: creator,
      createdBy: creator,
      targetUserId: target,
      isDirectThread: true,
    })).toEqual({ userId: target, viewerIsTarget: false, invalid: false });
  });

  it("mostra o remetente para o destinatário", () => {
    expect(resolveDirectThreadCounterpart({
      currentUserId: target,
      createdBy: creator,
      targetUserId: target,
      isDirectThread: true,
    })).toEqual({ userId: creator, viewerIsTarget: true, invalid: false });
  });

  it("mantém o membro como contraparte para a secretaria", () => {
    expect(resolveDirectThreadCounterpart({
      currentUserId: "00000000-0000-4000-8000-000000000003",
      createdBy: creator,
      targetUserId: target,
      isDirectThread: true,
    })).toEqual({ userId: target, viewerIsTarget: false, invalid: false });
  });

  it("invalida conversa contra a própria conta", () => {
    expect(resolveDirectThreadCounterpart({
      currentUserId: creator,
      createdBy: creator,
      targetUserId: creator,
      isDirectThread: true,
    })).toEqual({ userId: null, viewerIsTarget: false, invalid: true });
  });
});
