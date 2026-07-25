/**
 * R2 Upload — Utilitário para upload de arquivos grandes via Cloudflare R2.
 *
 * ══ REGRA DE ARMAZENAMENTO — NÃO ALTERAR SEM REVISÃO ══════════════════════
 *
 *  TIPO DE DADO              DESTINO                    MOTIVO
 *  ─────────────────────────────────────────────────────────────────────────
 *  Texto (mensagens)         Supabase DB                leve, indexável
 *  Imagens pequenas (<8MB)   Supabase Storage            acesso simples/CDN
 *  Documentos (<20MB)        Supabase Storage            acesso simples/CDN
 *  Áudios curtos (<5MB)      Supabase Storage            acesso simples
 *  Vídeos (qualquer tam.)    Cloudflare R2               evita limite Supabase
 *  Áudios >5MB               Cloudflare R2               evita limite Supabase
 *  Arquivos >25MB            Cloudflare R2               evita limite Supabase
 *  Mídia secreta (futuro)    Cloudflare R2 (criptog.)    E2EE client-side obrig.
 *
 *  Fallback: se a Edge Function get-r2-upload-url falhar, o upload de R2 falha.
 *  Não há fallback para Supabase Storage em arquivos que deveriam ir para R2.
 *  Isso é intencional para evitar uploads grandes no Supabase.
 *
 *  REGRA DE MÍDIA SECRETA (FUTURO):
 *    - Nunca enviar mídia de conversa secreta sem criptografia cliente.
 *    - Criptografar com AES-GCM no dispositivo ANTES de enviar à URL assinada.
 *    - Salvar no banco apenas a referência de storage (nunca o conteúdo).
 *    - O servidor (Supabase ou R2) não pode decifrar a mídia.
 *
 * Fluxo correto para R2:
 *   1. Frontend solicita URL assinada à Edge Function get-r2-upload-url
 *   2. Edge Function gera URL pré-assinada via R2 API
 *   3. Frontend envia o arquivo DIRETAMENTE para o R2 (não passa pelo Supabase)
 *   4. Frontend salva apenas os metadados no banco (storage_key, public_url, etc.)
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from "@/integrations/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

// "purpose" define, do lado do SERVIDOR (get-r2-upload-url), o bucket e o
// prefixo de caminho reais — o cliente nunca escolhe bucket/path livremente
// (isso permitiria caminho ou bucket arbitrário). Cada purpose exige a
// capability correspondente (canal.manage / tv.manage) validada na Edge
// Function antes de assinar qualquer upload.
export type R2UploadPurpose =
  | "canal-video"
  | "canal-thumbnail"
  | "tv-recording"
  | "tv-asset";

export type R2UploadOptions = {
  file: File;
  purpose: R2UploadPurpose;
  organizationId: string;
  onProgress?: (percent: number) => void;
};

export type R2UploadResult = {
  ok: boolean;
  storageKey?: string;
  publicUrl?: string;
  error?: string;
};

export type R2Metadata = {
  storageKey: string;
  publicUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  durationSeconds?: number;
};

// ── Solicitar URL assinada ────────────────────────────────────────────────────

async function getPresignedUploadUrl(
  purpose: R2UploadPurpose,
  contentType: string,
  fileSizeBytes: number,
  organizationId: string,
): Promise<{
  uploadUrl: string;
  publicUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
} | null> {
  try {
    const { data, error } = await supabase.functions.invoke("get-r2-upload-url", {
      body: {
        purpose,
        contentType,
        fileSizeBytes,
        organizationId,
      },
    });

    if (error || !data?.uploadUrl) return null;
    return {
      uploadUrl: String(data.uploadUrl),
      publicUrl: String(data.publicUrl),
      storageKey: String(data.storageKey),
      requiredHeaders: (data.requiredHeaders as Record<string, string> | undefined)
        ?? { "Content-Type": contentType },
    };
  } catch {
    return null;
  }
}

// ── Upload com progresso via XMLHttpRequest ───────────────────────────────────

function uploadWithProgress(
  url: string,
  file: File,
  requiredHeaders: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => resolve(xhr.status >= 200 && xhr.status < 300));
    xhr.addEventListener("error", () => resolve(false));
    xhr.addEventListener("abort", () => resolve(false));

    xhr.open("PUT", url, true);
    for (const [name, value] of Object.entries(requiredHeaders)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(file);
  });
}

// ── Upload principal ──────────────────────────────────────────────────────────

export async function uploadToR2({
  file,
  purpose,
  organizationId,
  onProgress,
}: R2UploadOptions): Promise<R2UploadResult> {
  const presigned = await getPresignedUploadUrl(
    purpose,
    file.type,
    file.size,
    organizationId,
  );

  if (!presigned) {
    return { ok: false, error: "r2_presigned_url_failed" };
  }

  const uploaded = await uploadWithProgress(
    presigned.uploadUrl,
    file,
    presigned.requiredHeaders,
    onProgress,
  );

  if (!uploaded) {
    return { ok: false, error: "r2_upload_failed" };
  }

  return {
    ok: true,
    storageKey: presigned.storageKey,
    publicUrl: presigned.publicUrl,
  };
}

// ── Verificar se arquivo deve usar R2 (em vez de Supabase Storage) ────────────
// REGRA (ver tabela no topo do arquivo):
//   - Vídeos: sempre R2 (qualquer tamanho)
//   - Áudios >5MB: R2
//   - Qualquer arquivo >25MB: R2
//   - Imagens, documentos e áudios pequenos: Supabase Storage (uploadInternalAttachment)
// ATENÇÃO: Não alterar estes limites sem revisar os limites do bucket Supabase Storage.

export function shouldUseR2(file: File): boolean {
  const type = file.type.toLowerCase();
  const sizeMb = file.size / (1024 * 1024);
  return (
    type.startsWith("video/") ||
    (type.startsWith("audio/") && sizeMb > 5) ||
    sizeMb > 25
  );
}
