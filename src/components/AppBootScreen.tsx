/**
 * Lightweight first-paint shell shown while the session/church/role data is
 * still resolving (auth loading, or protected-route gating). Visually
 * mirrors the static shell rendered synchronously in `index.html` (before
 * React even mounts), so there is no visible jump between the two — no
 * flash of a blank/white screen, and only ever this one calm screen instead
 * of several different spinners stacked as different providers resolve.
 */
export function AppBootScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#0B0B0F" }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] animate-pulse">
        <span className="font-serif text-3xl" style={{ color: "#E3A63E" }}>Ω</span>
      </div>
      <p className="text-[13px] font-medium tracking-wide text-white/70">Abrindo Ecclesia</p>
    </div>
  );
}
