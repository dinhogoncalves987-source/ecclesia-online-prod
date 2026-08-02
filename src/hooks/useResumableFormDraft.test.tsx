import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useResumableFormDraft, discardFormDraft } from "./useResumableFormDraft";
import { readFormDraft, saveFormDraft } from "@/lib/appResumeState";

const PATH = "/admin/membros";
const KEY = "test.draft";

function Probe({ enabled, value }: { enabled: boolean; value: { full_name: string } }) {
  useResumableFormDraft(KEY, PATH, enabled, value);
  return null;
}

describe("useResumableFormDraft", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("does not persist anything while disabled", async () => {
    render(<Probe enabled={false} value={{ full_name: "Ana" }} />);
    await new Promise((r) => setTimeout(r, 600));
    expect(readFormDraft(KEY, PATH)).toBeNull();
  });

  it("persists the latest value after the debounce window while enabled", async () => {
    render(<Probe enabled={true} value={{ full_name: "Ana" }} />);
    await new Promise((r) => setTimeout(r, 600));
    expect(readFormDraft(KEY, PATH)).toEqual({ full_name: "Ana" });
  });

  it("flushes immediately (bypassing debounce) on visibilitychange -> hidden", () => {
    render(<Probe enabled={true} value={{ full_name: "Bia" }} />);
    expect(readFormDraft(KEY, PATH)).toBeNull(); // debounce hasn't fired yet

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(readFormDraft(KEY, PATH)).toEqual({ full_name: "Bia" });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("flushes immediately on pagehide", () => {
    render(<Probe enabled={true} value={{ full_name: "Caio" }} />);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(readFormDraft(KEY, PATH)).toEqual({ full_name: "Caio" });
  });

  it("discardFormDraft removes a previously saved draft", () => {
    saveFormDraft(KEY, PATH, { full_name: "Duda" });
    expect(readFormDraft(KEY, PATH)).not.toBeNull();
    discardFormDraft(KEY);
    expect(readFormDraft(KEY, PATH)).toBeNull();
  });
});
