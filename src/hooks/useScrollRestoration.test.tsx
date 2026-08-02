import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useRef } from "react";
import { useScrollRestoration } from "./useScrollRestoration";
import { readScrollPosition, saveScrollPosition } from "@/lib/appResumeState";

const ROUTE = "/admin/membros";

function Probe() {
  const ref = useRef<HTMLDivElement | null>(null);
  useScrollRestoration(ROUTE, ref);
  return <div ref={ref} data-testid="container" />;
}

describe("useScrollRestoration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    window.scrollTo = vi.fn();
  });

  it("restores the persisted window scroll position on mount", async () => {
    saveScrollPosition(ROUTE, { window: 480 }, ROUTE);
    render(<Probe />);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 480, behavior: "auto" });
  });

  it("does nothing when there is no stored position for the route", async () => {
    render(<Probe />);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("persists the current window scroll position immediately on pagehide", () => {
    render(<Probe />);
    Object.defineProperty(window, "scrollY", { value: 777, configurable: true });

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(readScrollPosition(ROUTE)).toEqual(expect.objectContaining({ window: 777 }));
  });

  it("persists on visibilitychange -> hidden", () => {
    render(<Probe />);
    Object.defineProperty(window, "scrollY", { value: 321, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(readScrollPosition(ROUTE)).toEqual(expect.objectContaining({ window: 321 }));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
