/**
 * platformDetect — detecção de plataforma do dispositivo.
 * Usado para aplicar regras do Modo Gravação e Wake Lock.
 */

export type Platform = "ios" | "android" | "other";

/** Detecta a plataforma com base no userAgent. */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

/** Verdadeiro se o dispositivo for celular ou tablet (iOS ou Android). */
export function isMobileDevice(): boolean {
  const p = detectPlatform();
  return p === "ios" || p === "android";
}

/** Verdadeiro se o device suportar a Screen Wake Lock API. */
export function supportsWakeLock(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** Verdadeiro se o dispositivo suportar requestFullscreen. */
export function supportsFullscreen(): boolean {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  return typeof el.requestFullscreen === "function" ||
    typeof el.webkitRequestFullscreen === "function";
}

/** Solicita tela cheia no Android (ignora silenciosamente se não suportado). */
export async function requestFullscreenIfAndroid(): Promise<void> {
  if (detectPlatform() !== "android") return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (typeof el.requestFullscreen === "function") {
      await el.requestFullscreen();
    } else if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
    }
  } catch { /* ignorar se negado pelo browser */ }
}
