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

export type R2UploadOptions = {
  file: File;
  bucket: string;
  path: string;
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
  bucket: string,
  path: string,
  contentType: string,
  organizationId: string,
): Promise<{ uploadUrl: string; publicUrl: string; storageKey: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("get-r2-upload-url", {
      body: {
        bucket,
        path,
        contentType,
        organizationId,
      },
    });

    if (error || !data?.uploadUrl) return null;
    return data as { uploadUrl: string; publicUrl: string; storageKey: string };
  } catch {
    return null;
  }
}

// ── Upload com progresso via XMLHttpRequest ───────────────────────────────────

function uploadWithProgress(
  url: string,
  file: File,
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
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// ── Upload principal ──────────────────────────────────────────────────────────

export async function uploadToR2({
  file,
  bucket,
  path,
  organizationId,
  onProgress,
}: R2UploadOptions): Promise<R2UploadResult> {
  const presigned = await getPresignedUploadUrl(
    bucket,
    path,
    file.type,
    organizationId,
  );

  if (!presigned) {
    return { ok: false, error: "r2_presigned_url_failed" };
  }

  const uploaded = await uploadWithProgress(presigned.uploadUrl, file, onProgress);

  if (!uploaded) {
    return { ok: false, error: "r2_upload_failed" };
  }

  return {
    ok: true,
    storageKey: presigned.storageKey,
    publicUrl: presigned.publicUrl,
  };
}

// ── Gerar path único para o arquivo ──────────────────────────────────────────

export function buildR2Path(
  organizationId: string,
  folder: string,
  file: File,
): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${organizationId}/${folder}/${timestamp}-${random}.${ext}`;
}

// ── Determinar bucket correto por tipo de arquivo ─────────────────────────────

export function getR2BucketForFile(file: File): "ecclesia-media" | "ecclesia-documents" {
  const type = file.type.toLowerCase();
  if (
    type.startsWith("video/") ||
    type.startsWith("audio/") ||
    type.startsWith("image/")
  ) {
    return "ecclesia-media";
  }
  return "ecclesia-documents";
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
