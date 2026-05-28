/**
 * Fetch público para Edge Functions do Supabase.
 * Sempre usa a publishable key — NUNCA o JWT do usuário logado.
 * (JWT de sessão + gateway Supabase causava "Failed to fetch" no browser.)
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export function getPublicEdgeHeaders(): Record<string, string> {
  if (!SUPABASE_KEY) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY não configurada");
  }
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

export function getEdgeFunctionUrl(functionName: string, params?: Record<string, string>): string {
  if (!SUPABASE_URL) {
    throw new Error("VITE_SUPABASE_URL não configurada");
  }
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  return `${SUPABASE_URL}/functions/v1/${functionName}${qs}`;
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
