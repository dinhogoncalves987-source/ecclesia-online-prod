// Ecclesia Share Utility
// Builds public /share URLs and triggers native share or clipboard fallback.

export type ShareType = "devotional" | "bible" | "message";

export interface ShareParams {
  type: ShareType;
  title?: string;
  verse?: string;
  ref?: string;
  text?: string;
  church?: string;   // organization slug — used for signup CTA
  lang?: string;     // "pt" | "en" | "es"
}

const MAX_TITLE  = 80;
const MAX_VERSE  = 300;
const MAX_REF    = 50;
const MAX_TEXT   = 600;
const MAX_CHURCH = 80;

/** Build an absolute /share URL with sanitized params. */
export function buildShareUrl(params: ShareParams): string {
  const p = new URLSearchParams();
  p.set("type", (params.type ?? "message").slice(0, 20));
  if (params.title)  p.set("title",  params.title.slice(0, MAX_TITLE));
  if (params.verse)  p.set("verse",  params.verse.slice(0, MAX_VERSE));
  if (params.ref)    p.set("ref",    params.ref.slice(0, MAX_REF));
  if (params.text)   p.set("text",   params.text.slice(0, MAX_TEXT));
  if (params.church) p.set("church", params.church.replace(/[^a-z0-9-]/gi, "").slice(0, MAX_CHURCH));
  if (params.lang)   p.set("lang",   params.lang.slice(0, 5));
  return `${window.location.origin}/share?${p.toString()}`;
}

/** Trigger native share sheet or fall back to clipboard. Returns "shared" | "copied" | "cancelled". */
export async function triggerShare({
  url,
  title,
  text,
}: {
  url: string;
  title?: string;
  text?: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator === "undefined") return "cancelled";

  if (navigator.share) {
    try {
      await navigator.share({ title: title || "Ecclesia", text, url });
      return "shared";
    } catch {
      // User cancelled or API not allowed
      return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "cancelled";
  }
}
