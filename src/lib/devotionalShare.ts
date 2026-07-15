import { environment } from "@/config/environment";

/**
 * Compostas a partir de VITE_PUBLIC_APP_URL (via src/config/environment.ts)
 * — nunca um domínio fixo. Isso garante que staging nunca gere links de
 * compartilhamento apontando para o domínio oficial de produção.
 */
export const DEVOTIONAL_PUBLIC_URL = `${environment.publicAppUrl}/devocional`;
export const DEVOTIONAL_OG_IMAGE = `${environment.publicAppUrl}/og-devocional.png`;

export const DEVOTIONAL_SHARE_TITLE = "Devocional Ecclesia";

export type DevotionalLocale = "pt" | "en" | "es";

const SHARE_COPY: Record<string, Record<DevotionalLocale, string>> = {
  tagline: {
    pt: "Uma palavra diária para fortalecer a fé.",
    en: "A daily word to strengthen your faith.",
    es: "Una palabra diaria para fortalecer la fe.",
  },
  cta: {
    pt: "Leia o devocional de hoje:",
    en: "Read today's devotional:",
    es: "Lee el devocional de hoy:",
  },
};

/** Normalize reflection text for display or share. */
export function normalizeReflection(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

/** Truncate reflection to a short pastoral snippet (~2–3 sentences). */
export function truncateReflection(text: string, maxChars = 220): string {
  const normalized = normalizeReflection(text);
  if (normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastBreak > maxChars * 0.45) return slice.slice(0, lastBreak + 1).trim();

  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
  return trimmed.endsWith("…") ? trimmed : `${trimmed}…`;
}

/** Share URL with short params so the public page shows the same content. */
export function buildDevotionalShareUrl(params: {
  verse: string;
  reference: string;
  reflection: string;
}): string {
  const p = new URLSearchParams();
  p.set("v", params.verse.trim().slice(0, 300));
  p.set("r", params.reference.trim().slice(0, 80));
  p.set("t", truncateReflection(params.reflection, 220));
  return `${DEVOTIONAL_PUBLIC_URL}?${p.toString()}`;
}

export function parseDevotionalShareParams(search: URLSearchParams): {
  verse: string;
  reference: string;
  reflection: string;
} | null {
  const verse = search.get("v")?.trim() ?? "";
  const reference = search.get("r")?.trim() ?? "";
  const reflection = search.get("t")?.trim() ?? "";
  if (!verse) return null;
  return { verse, reference, reflection };
}

export function buildDevotionalSharePayload(params: {
  verse: string;
  reference: string;
  reflection: string;
  locale?: DevotionalLocale;
}): { title: string; text: string; textNative: string; url: string } {
  const verse = params.verse.trim();
  const reference = params.reference.trim();
  const fullReflection = normalizeReflection(params.reflection);
  const url = DEVOTIONAL_PUBLIC_URL;

  const lines = [
    DEVOTIONAL_SHARE_TITLE,
    `"${verse}"`,
    `— ${reference}`,
    "",
    fullReflection,
    "",
    url,
  ];

  const text = lines.join("\n");
  const textNative = text;

  return { title: DEVOTIONAL_SHARE_TITLE, text, textNative, url };
}
