import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("chat moderno — chamadas individuais e reuniões separadas", () => {
  const callMigration = "20260803170000_internal_calls_foundation.sql";

  it("mantém a migration idêntica nos dois bancos", () => {
    const staging = read(`supabase/migrations/${callMigration}`);
    const production = read(`supabase-production/supabase/migrations/${callMigration}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("protege estado e sinalização por RLS e RPCs autenticadas", () => {
    const sql = read(`supabase/migrations/${callMigration}`);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.internal_calls");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.internal_call_signals");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.start_internal_call");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.transition_internal_call");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.send_internal_call_signal");
    expect(sql).toContain("auth.uid() IN (caller_user_id, callee_user_id)");
    expect(sql).toContain("REVOKE ALL ON public.internal_calls FROM anon, authenticated");
    expect(sql).toContain("source <> 'secretariat'");
    expect(sql).not.toContain("meet.jit.si");
    expect(sql).not.toContain("graph.facebook.com");
  });

  it("telefone e câmera iniciam WebRTC individual, nunca uma reunião Jitsi", () => {
    const panel = read("src/components/messages/InternalChatPanel.tsx");
    expect(panel).toContain('void startCall(thread, "voice")');
    expect(panel).toContain('void startCall(thread, "video")');
    expect(panel).toContain('thread?.source === "meeting"');
    expect(panel).toContain("onJoinMeeting");

    const voiceHandler = panel.match(/onVoiceCall=\{[^]*?onVideoCall=/)?.[0] ?? "";
    const videoHandler = panel.match(/onVideoCall=\{[^]*?onJoinMeeting=/)?.[0] ?? "";
    expect(voiceHandler).not.toContain("setMeetingOpen");
    expect(videoHandler).not.toContain("setMeetingOpen");
  });

  it("usa mídia nativa, controles móveis e relay próprio temporário", () => {
    const hook = read("src/hooks/useInternalCall.tsx");
    const overlay = read("src/components/messages/InternalCallOverlay.tsx");
    const ice = read("supabase/functions/get-internal-call-ice/index.ts");

    expect(hook).toContain("new RTCPeerConnection");
    expect(hook).toContain("navigator.mediaDevices.getUserMedia");
    expect(hook).toContain("echoCancellation: true");
    expect(hook).toContain("noiseSuppression: true");
    expect(overlay).toContain("Atender chamada");
    expect(overlay).toContain("Recusar chamada");
    expect(overlay).toContain("Trocar câmera");
    expect(ice).toContain("TURN_SHARED_SECRET");
    expect(ice).toContain('{ name: "HMAC", hash: "SHA-1" }');
    expect(ice).not.toContain("stun.l.google");
    expect(ice).not.toContain("meet.jit.si");
  });
});
