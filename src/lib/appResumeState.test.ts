import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  sanitizeForResume,
  saveResumeSnapshot,
  readResumeSnapshot,
  clearResumeSnapshot,
  saveFormDraft,
  readFormDraft,
  clearFormDraft,
  saveScrollPosition,
  readScrollPosition,
} from "./appResumeState";

describe("sanitizeForResume", () => {
  it("keeps plain serializable fields untouched, including legitimate null values", () => {
    const result = sanitizeForResume({ full_name: "João", age: 30, active: true, congregation_id: null });
    expect(result).toEqual({ full_name: "João", age: 30, active: true, congregation_id: null });
  });

  it("recursively strips any key that looks like a secret, at any depth", () => {
    const result = sanitizeForResume({
      email: "a@b.com",
      password: "should-never-persist",
      senha: "nunca-persistir",
      otp: "123456",
      access_token: "eyJ...",
      refreshToken: "abc",
      nested: { apiKey: "xyz", pin: "1234", cvv: "999", ok: "value" },
    });
    expect(result).toEqual({ email: "a@b.com", nested: { ok: "value" } });
  });

  it("drops File/Blob/FileList/function values instead of throwing", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const result = sanitizeForResume({
      name: "member",
      photoFile: file,
      onSave: () => {},
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ name: "member" });
  });

  it("never throws on circular references", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => sanitizeForResume(circular)).not.toThrow();
  });
});

describe("appResumeState (sessionStorage-backed)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("returns null when nothing was ever saved", () => {
    expect(readResumeSnapshot()).toBeNull();
  });

  it("round-trips a saved snapshot", () => {
    saveResumeSnapshot({ path: "/admin/membros", forms: { draft: { full_name: "Ana" } } });
    const snapshot = readResumeSnapshot();
    expect(snapshot?.path).toBe("/admin/membros");
    expect(snapshot?.forms?.draft).toEqual({ full_name: "Ana" });
  });

  it("merges successive saves instead of overwriting unrelated keys", () => {
    saveResumeSnapshot({ path: "/admin/membros", forms: { a: 1 } });
    saveResumeSnapshot({ path: "/admin/membros", forms: { b: 2 } });
    const snapshot = readResumeSnapshot();
    expect(snapshot?.forms).toEqual({ a: 1, b: 2 });
  });

  it("treats a snapshot older than the max age as stale and returns null", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    saveResumeSnapshot({ path: "/admin/membros", forms: { a: 1 } });

    nowSpy.mockReturnValue(1_000_000 + 31 * 60 * 1000); // 31 minutes later
    expect(readResumeSnapshot()).toBeNull();

    nowSpy.mockRestore();
  });

  it("never throws on corrupted JSON under the storage key", () => {
    sessionStorage.setItem("ecclesia.resume.v1", "{not-json");
    expect(readResumeSnapshot()).toBeNull();
  });

  it("clearResumeSnapshot removes everything", () => {
    saveResumeSnapshot({ path: "/admin/membros", forms: { a: 1 } });
    clearResumeSnapshot();
    expect(readResumeSnapshot()).toBeNull();
  });

  it("readFormDraft only returns the draft if the path matches the last saved path", () => {
    saveFormDraft("membros.cadastro", "/admin/membros", { full_name: "Ana" });
    expect(readFormDraft("membros.cadastro", "/admin/membros")).toEqual({ full_name: "Ana" });
    expect(readFormDraft("membros.cadastro", "/admin/agenda")).toBeNull();
  });

  it("clearFormDraft removes only the named draft, keeping siblings and scroll data", () => {
    saveFormDraft("membros.cadastro", "/admin/membros", { full_name: "Ana" });
    saveFormDraft("chat.draft", "/admin/membros", { text: "oi" });
    clearFormDraft("membros.cadastro");
    expect(readFormDraft("membros.cadastro", "/admin/membros")).toBeNull();
    expect(readFormDraft("chat.draft", "/admin/membros")).toEqual({ text: "oi" });
  });

  it("round-trips scroll position per route key", () => {
    saveScrollPosition("/admin/membros", { window: 240, container: 0 }, "/admin/membros");
    expect(readScrollPosition("/admin/membros")).toEqual({ window: 240, container: 0 });
    expect(readScrollPosition("/admin/agenda")).toBeNull();
  });

  it("never persists a password/OTP even if buried inside a form draft object", () => {
    saveFormDraft("login.draft", "/login", { email: "a@b.com", password: "hunter2" });
    const raw = sessionStorage.getItem("ecclesia.resume.v1");
    expect(raw).not.toContain("hunter2");
    expect(readFormDraft("login.draft", "/login")).toEqual({ email: "a@b.com" });
  });
});
