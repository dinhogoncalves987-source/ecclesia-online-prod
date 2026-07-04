#!/usr/bin/env bash
# heartbeat_monitor.sh — Envia heartbeat para todas as sessões live ativas.
#
# Executado pelo container heartbeat-monitor a cada 30 segundos.
# Para cada sessão live: chama a Edge Function update-tv-heartbeat.
# Se a sessão não receber heartbeat por >90s → check_stale_live_sessions marca como error.

set -e

LOG_PREFIX="[heartbeat_monitor.sh]"

if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

# Buscar sessões live ativas via Supabase REST
RESPONSE=$(curl -s \
  "${SUPABASE_URL}/rest/v1/tv_live_sessions?status_transmissao=eq.live&select=id" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

# Extrair IDs das sessões (formato JSON array)
SESSION_IDS=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_IDS" ]; then
  # Sem sessões ativas — checar stale de qualquer forma
  curl -s -X GET \
    "${SUPABASE_URL}/functions/v1/check-stale-sessions" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" > /dev/null
  exit 0
fi

COUNT=0
for SID in $SESSION_IDS; do
  RESULT=$(curl -s -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/functions/v1/update-tv-heartbeat" \
    -H "Content-Type: application/json" \
    -H "x-mediamtx-secret: ${MEDIAMTX_WEBHOOK_SECRET}" \
    -d "{\"session_id\": \"${SID}\"}")

  CODE="${RESULT: -3}"
  if [ "$CODE" = "200" ]; then
    COUNT=$((COUNT + 1))
  else
    echo "$LOG_PREFIX WARNING: heartbeat failed for session $SID (HTTP $CODE)"
  fi
done

echo "$LOG_PREFIX Heartbeat sent to $COUNT active session(s)"
