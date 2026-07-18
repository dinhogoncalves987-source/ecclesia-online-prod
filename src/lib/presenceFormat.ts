/** Formata "visto por último" a partir de um timestamp real (last_seen_at). */
export function formatLastSeen(lastSeenAt: string | null | undefined, lang: string): string {
  if (!lastSeenAt) return "";
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const date = new Date(lastSeenAt);
  const now = new Date();

  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const at = lang === "en" ? "at" : lang === "es" ? "a las" : "às";
  const prefix = lang === "en" ? "last seen" : lang === "es" ? "visto por última vez" : "visto por último";

  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isSameDay) {
    const today = lang === "en" ? "today" : lang === "es" ? "hoy" : "hoje";
    return `${prefix} ${today} ${at} ${time}`;
  }
  if (isYesterday) {
    const yest = lang === "en" ? "yesterday" : lang === "es" ? "ayer" : "ontem";
    return `${prefix} ${yest} ${at} ${time}`;
  }

  const dateStr = date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  return `${prefix} ${dateStr} ${at} ${time}`;
}
