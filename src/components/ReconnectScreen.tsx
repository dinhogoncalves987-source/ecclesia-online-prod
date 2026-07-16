/**
 * Shown whenever we have strong evidence that the user IS authenticated
 * (a persisted session token, or previously-loaded access data) but the
 * current attempt to confirm/refresh it failed or timed out — e.g. no
 * network, backend unavailable. This is a deliberately different screen
 * from both the login form and the generic boot shell: it must never imply
 * the user was logged out, and always offers a manual way to retry.
 */
export function ReconnectScreen({
  onRetry,
  description = "Você já está conectado neste dispositivo. Verifique sua internet e tente novamente — seus dados não foram perdidos.",
}: {
  onRetry: () => void;
  description?: string;
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ backgroundColor: "#0B0B0F" }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06]">
        <span className="font-serif text-3xl" style={{ color: "#E3A63E" }}>Ω</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-white/90">Não foi possível confirmar sua sessão</p>
        <p className="max-w-xs text-xs text-white/60">{description}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#E3A63E", color: "#0B0B0F" }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
