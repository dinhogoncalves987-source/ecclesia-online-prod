#!/usr/bin/env bash
# record_stream.sh — Consolida gravação, gera thumbnail e faz upload para R2.
#
# Uso:
#   bash record_stream.sh <session_id> <stream_key> <recording_path>
#
# Dependências:
#   ffmpeg, aws-cli (com credenciais R2 configuradas)

set -e

SESSION_ID="$1"
STREAM_KEY="$2"
RECORDING_PATH="$3"

LOG_PREFIX="[record_stream.sh] $SESSION_ID"
TEMP_DIR="${TEMP_DIR:-/tmp/ecclesia}"
OUTPUT_MP4="${TEMP_DIR}/${SESSION_ID}.mp4"
THUMBNAIL="${TEMP_DIR}/${SESSION_ID}_thumb.jpg"

if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

echo "$LOG_PREFIX Starting recording consolidation"
echo "$LOG_PREFIX Recording path: $RECORDING_PATH"

# ── 1. Encontrar arquivos de gravação ─────────────────────────────────────────
# MediaMTX grava em formato fmp4; encontrar arquivos .mp4 mais recentes

RECORDING_FILES=$(find "$RECORDING_PATH" -name "*.mp4" -newer "${TEMP_DIR}/session_${STREAM_KEY}.ts" 2>/dev/null || \
                  find "$RECORDING_PATH" -name "*.mp4" 2>/dev/null | sort | tail -5)

if [ -z "$RECORDING_FILES" ]; then
  echo "$LOG_PREFIX WARNING: no recording files found in $RECORDING_PATH"

  # Atualizar status como failed
  curl -s -X PATCH \
    "${SUPABASE_URL}/rest/v1/tv_live_sessions?id=eq.${SESSION_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"recording_status": "failed", "error_message": "Nenhum arquivo de gravação encontrado"}'
  exit 1
fi

echo "$LOG_PREFIX Files found: $(echo "$RECORDING_FILES" | wc -l)"

# ── 2. Concatenar/copiar para MP4 final ──────────────────────────────────────
# Se houver múltiplos segmentos, usar concat
FILE_COUNT=$(echo "$RECORDING_FILES" | wc -l)

if [ "$FILE_COUNT" -eq 1 ]; then
  FIRST_FILE=$(echo "$RECORDING_FILES" | head -1)
  echo "$LOG_PREFIX Single segment — copying to output"
  ffmpeg -y -i "$FIRST_FILE" \
    -c copy \
    -movflags +faststart \
    "$OUTPUT_MP4" 2>&1 | tail -5
else
  echo "$LOG_PREFIX Multiple segments ($FILE_COUNT) — concatenating"
  CONCAT_LIST="${TEMP_DIR}/concat_${SESSION_ID}.txt"
  echo "$RECORDING_FILES" | while read -r f; do echo "file '$f'"; done > "$CONCAT_LIST"
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
    -c copy \
    -movflags +faststart \
    "$OUTPUT_MP4" 2>&1 | tail -5
  rm -f "$CONCAT_LIST"
fi

if [ ! -f "$OUTPUT_MP4" ]; then
  echo "$LOG_PREFIX ERROR: FFmpeg failed to create output file"
  curl -s -X PATCH \
    "${SUPABASE_URL}/rest/v1/tv_live_sessions?id=eq.${SESSION_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"recording_status": "failed", "error_message": "Falha ao consolidar arquivo de gravação"}'
  exit 1
fi

FILE_SIZE=$(stat -c%s "$OUTPUT_MP4" 2>/dev/null || stat -f%z "$OUTPUT_MP4")
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_MP4" 2>/dev/null | cut -d. -f1)
echo "$LOG_PREFIX Output: $OUTPUT_MP4 (${FILE_SIZE} bytes, ${DURATION}s)"

# ── 3. Gerar thumbnail ────────────────────────────────────────────────────────
bash /scripts/generate_thumbnail.sh "$SESSION_ID" "$OUTPUT_MP4" "$THUMBNAIL"

# ── 4. Upload MP4 para R2 ────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y/%m/%d)
R2_KEY="tv/recordings/${TIMESTAMP}/${SESSION_ID}.mp4"
R2_THUMB_KEY="tv/thumbnails/${SESSION_ID}.jpg"

echo "$LOG_PREFIX Uploading MP4 to R2: $R2_KEY"
bash /scripts/upload_to_r2.sh \
  "$OUTPUT_MP4" \
  "${R2_BUCKET_TV:-ecclesia-tv-recordings}" \
  "$R2_KEY" \
  "video/mp4"

# Upload thumbnail
if [ -f "$THUMBNAIL" ]; then
  echo "$LOG_PREFIX Uploading thumbnail to R2: $R2_THUMB_KEY"
  bash /scripts/upload_to_r2.sh \
    "$THUMBNAIL" \
    "${R2_BUCKET_TV:-ecclesia-tv-recordings}" \
    "$R2_THUMB_KEY" \
    "image/jpeg"
fi

PLAYBACK_URL="${R2_PUBLIC_URL:-https://media.ecclesia.com.br}/${R2_KEY}"
THUMB_URL="${R2_PUBLIC_URL:-https://media.ecclesia.com.br}/${R2_THUMB_KEY}"

# ── 5. Atualizar Supabase ────────────────────────────────────────────────────
echo "$LOG_PREFIX Updating Supabase session with recording info"

curl -s -X PATCH \
  "${SUPABASE_URL}/rest/v1/tv_live_sessions?id=eq.${SESSION_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"recording_status\": \"uploaded\",
    \"r2_storage_key\": \"${R2_KEY}\",
    \"playback_url\": \"${PLAYBACK_URL}\"
  }"

# Criar registro em tv_replays
curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/tv_replays" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"organization_id\": \"$(cat ${TEMP_DIR}/org_${SESSION_ID}.id 2>/dev/null || echo 'unknown')\",
    \"tv_channel_id\": \"$(cat ${TEMP_DIR}/channel_${SESSION_ID}.id 2>/dev/null || echo 'unknown')\",
    \"live_session_id\": \"${SESSION_ID}\",
    \"title\": \"Transmissão — $(date -u +%d/%m/%Y)\",
    \"hls_url\": \"${PLAYBACK_URL}\",
    \"r2_storage_key\": \"${R2_KEY}\",
    \"thumbnail_url\": \"${THUMB_URL}\",
    \"duration_seconds\": ${DURATION:-0},
    \"file_size_bytes\": ${FILE_SIZE:-0},
    \"status\": \"ready\",
    \"recorded_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"published_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }"

# ── 6. Limpeza ────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Cleaning up temp files"
rm -f "$OUTPUT_MP4" "$THUMBNAIL"

echo "$LOG_PREFIX Done! Recording uploaded to R2: $PLAYBACK_URL"
