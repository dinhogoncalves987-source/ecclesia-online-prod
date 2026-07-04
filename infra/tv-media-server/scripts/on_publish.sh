#!/usr/bin/env bash
# on_publish.sh — Chamado pelo MediaMTX quando OBS/celular conecta e envia stream.
# Variáveis injetadas pelo MediaMTX:
#   $1 = MTX_PATH  (ex: live/ecclesia_abc123de)
#   $2 = MTX_SOURCE_TYPE (ex: rtmpConn)
#
# Fluxo:
#   1. Extrair stream_key do path (tudo após "live/")
#   2. Chamar Edge Function validate-tv-stream-key
#   3. Salvar session_id para uso no on_unpublish e heartbeat
#   4. Exit 0 = aceitar transmissão | Exit 1 = rejeitar

set -e

MTX_PATH="$1"
SOURCE_TYPE="${2:-obs}"
LOG_PREFIX="[on_publish.sh] $MTX_PATH"

# Carregar variáveis de ambiente
if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

# Derivar stream_key do path (ex: "live/ecclesia_abc123" → "ecclesia_abc123")
STREAM_KEY="${MTX_PATH#live/}"
if [ -z "$STREAM_KEY" ]; then
  echo "$LOG_PREFIX ERROR: empty stream_key, rejecting"
  exit 1
fi

# Mapeamento de source_type MediaMTX → Ecclesia
case "$SOURCE_TYPE" in
  rtmpConn)      EC_SOURCE="obs"      ;;
  rtmpConnLocal) EC_SOURCE="computer" ;;
  srtConn)       EC_SOURCE="mobile"   ;;
  *)             EC_SOURCE="obs"      ;;
esac

echo "$LOG_PREFIX Validating stream key (last4: ${STREAM_KEY: -4})"

# Chamar Edge Function
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/functions/v1/validate-tv-stream-key" \
  -H "Content-Type: application/json" \
  -H "x-mediamtx-secret: ${MEDIAMTX_WEBHOOK_SECRET}" \
  -d "{
    \"stream_key\": \"${STREAM_KEY}\",
    \"source_type\": \"${EC_SOURCE}\",
    \"ingest_base_url\": \"${MEDIA_RTMP_URL}\",
    \"hls_base_url\": \"${MEDIA_HLS_BASE_URL}\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "$LOG_PREFIX HTTP $HTTP_CODE | response: ${BODY:0:200}"

if [ "$HTTP_CODE" != "200" ]; then
  echo "$LOG_PREFIX REJECTED: invalid stream key"
  exit 1
fi

# Extrair session_id da resposta JSON e salvar para o heartbeat
SESSION_ID=$(echo "$BODY" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
  mkdir -p "${TEMP_DIR:-/tmp/ecclesia}"
  echo "$SESSION_ID" > "${TEMP_DIR:-/tmp/ecclesia}/session_${STREAM_KEY}.id"
  echo "$LOG_PREFIX Session ID saved: $SESSION_ID"
fi

echo "$LOG_PREFIX Stream accepted — live!"
exit 0
