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

  it("keeps retrying scrollTo while the page content is still short (async list still loading)", async () => {
    // Reproduz o bug real observado em staging: no primeiro
    // requestAnimationFrame a lista (React Query) ainda não carregou, então
    // o documento é curto demais para rolar até o valor salvo — o
    // navegador "clampa" o scroll de volta para perto do topo. Sem retry,
    // essa seria a posição final; com retry, uma vez que o conteúdo cresce
    // (simulado aqui trocando scrollY para o valor alvo a partir da 3ª
    // tentativa), a posição salva deve "pegar".
    saveScrollPosition(ROUTE, { window: 900 }, ROUTE);
    let scrollToCalls = 0;
    let currentScrollY = 30; // conteúdo curto — scrollTo(900) fica "clampado" perto do topo
    window.scrollTo = vi.fn(() => {
      scrollToCalls += 1;
      currentScrollY = scrollToCalls >= 3 ? 900 : 30; // lista termina de carregar na 3ª tentativa
    });
    Object.defineProperty(window, "scrollY", { get: () => currentScrollY, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 2000, configurable: true });

    render(<Probe />);
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        await new Promise((r) => setTimeout(r, 160));
      }
    });

    expect(scrollToCalls).toBeGreaterThanOrEqual(3);
    expect(currentScrollY).toBe(900);
  });

  it("does not give up early just because the document is still short on the first few attempts (regression)", async () => {
    // Bug real reproduzido ao vivo em staging: uma primeira versão desta
    // heurística de "desistir se o conteúdo é curto demais para o alvo"
    // disparava já na 1ª tentativa (documento ainda só com a altura do
    // esqueleto de loading, scrollHeight == innerHeight, logo
    // maxScrollable == 0 < target) e cancelava o retry para sempre — mesmo
    // que a lista real (React Query) fosse crescer o documento segundos
    // depois. scrollHeight fica curto pelas primeiras 7 tentativas (menos
    // que RESTORE_MIN_ATTEMPTS_BEFORE_SHORT_CONTENT_EXIT) e só cresce o
    // suficiente na 8ª — a restauração deve continuar tentando e pegar o
    // valor salvo, nunca desistir antes disso por causa da heurística.
    saveScrollPosition(ROUTE, { window: 900 }, ROUTE);
    let scrollToCalls = 0;
    let currentScrollY = 0;
    let currentScrollHeight = 300; // documento ainda no esqueleto: mais curto que innerHeight + target
    window.scrollTo = vi.fn(() => {
      scrollToCalls += 1;
      if (scrollToCalls >= 8) {
        currentScrollHeight = 2000; // lista termina de carregar
        currentScrollY = 900;
      }
    });
    Object.defineProperty(window, "scrollY", { get: () => currentScrollY, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      get: () => currentScrollHeight,
      configurable: true,
    });

    render(<Probe />);
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        await new Promise((r) => setTimeout(r, 160));
      }
    });

    expect(scrollToCalls).toBeGreaterThanOrEqual(8);
    expect(currentScrollY).toBe(900);
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
