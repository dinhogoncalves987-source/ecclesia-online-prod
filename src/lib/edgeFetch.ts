/**
 * Fetch público para Edge Functions do Supabase.
 * Sempre usa a publishable key — NUNCA o JWT do usuário logado.
 * (JWT de sessão + gateway Supabase causava "Failed to fetch" no browser.)
 *
 * FASE 4: URL/chave vêm exclusivamente de `environment` (já validado contra
 * o ambiente atual) — nunca lidas diretamente de `import.meta.env` aqui, para
 * que não existam pontos soltos capazes de divergir da configuração central.
 */
import { environment } from "@/config/environment";

export function getPublicEdgeHeaders(): Record<string, string> {
  const key = environment.supabasePublishableKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export function getEdgeFunctionUrl(functionName: string, params?: Record<string, string>): string {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  return `${environment.supabaseUrl}/functions/v1/${functionName}${qs}`;
}

export async function fetchEdgeFunction<T>(
  functionName: string,
  params: Record<string, string>,
  options?: { timeoutMs?: number; cache?: RequestCache },
): Promise<T> {
  const url = getEdgeFunctionUrl(functionName, params);
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      cache: options?.cache ?? "default",
      signal: controller.signal,
      headers: getPublicEdgeHeaders(),
    });

    const data = await resp.json().catch(() => ({} as T & { error?: string }));

    if (!resp.ok) {
      const msg = (data as { error?: string }).error || `HTTP ${resp.status}`;
      throw new Error(msg);
    }

    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}
