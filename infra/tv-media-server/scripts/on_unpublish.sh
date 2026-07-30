#!/usr/bin/env bash
# on_unpublish.sh — Chamado pelo MediaMTX quando a transmissão termina.
# Variáveis:
#   $1 = MTX_PATH  (ex: live/ecclesia_abc123)
#   $2 = MTX_SOURCE_TYPE
#
# Fluxo:
#   1. Recuperar session_id salvo pelo on_publish
#   2. Marcar transmissão como ended via RPC Supabase
#   3. Iniciar processamento de gravação em background
#   4. Gerar thumbnail

set -e

MTX_PATH="$1"
SOURCE_TYPE="${2:-obs}"
LOG_PREFIX="[on_unpublish.sh] $MTX_PATH"

if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

STREAM_KEY="${MTX_PATH#live/}"
TEMP_DIR="${TEMP_DIR:-/tmp/ecclesia}"
SESSION_FILE="${TEMP_DIR}/session_${STREAM_KEY}.id"

echo "$LOG_PREFIX Stream ended"

# Recuperar session_id
SESSION_ID=""
if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(cat "$SESSION_FILE")
  rm -f "$SESSION_FILE"
fi

if [ -z "$SESSION_ID" ]; then
  echo "$LOG_PREFIX WARNING: no session_id found — cannot update status"
  exit 0
fi

echo "$LOG_PREFIX Session: $SESSION_ID"

# Marcar sessão como ended via Supabase REST
curl -s -X PATCH \
  "${SUPABASE_URL}/rest/v1/tv_live_sessions?id=eq.${SESSION_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"status_transmissao\": \"ended\",
    \"ended_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"recording_status\": \"processing\"
  }"

echo "$LOG_PREFIX Session marked as ended"

# Iniciar processamento de gravação em background (não bloqueia o MediaMTX)
RECORDING_PATH="${RECORDINGS_DIR:-/recordings}/live/${STREAM_KEY}"

if [ -d "$RECORDING_PATH" ]; then
  echo "$LOG_PREFIX Starting background recording processing..."
  nohup bash /scripts/record_stream.sh \
    "$SESSION_ID" \
    "$STREAM_KEY" \
    "$RECORDING_PATH" \
    > "${TEMP_DIR}/record_${SESSION_ID}.log" 2>&1 &
  echo "$LOG_PREFIX Recording processor PID: $!"
else
  echo "$LOG_PREFIX WARNING: recording path not found: $RECORDING_PATH"
fi

exit 0
