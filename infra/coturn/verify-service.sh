#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${1:-"$BASE_DIR/turn.env"}

fail() {
  printf '%s\n' "ERRO: $1" >&2
  exit 1
}

[ -f "$ENV_FILE" ] || fail "arquivo turn.env ausente"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

for variable in TURN_REALM TURN_EXTERNAL_IP TURN_LISTENING_PORT TURN_TLS_LISTENING_PORT TURN_MIN_PORT TURN_MAX_PORT; do
  eval "value=\${$variable:-}"
  [ -n "$value" ] || fail "$variable não configurada"
done

docker compose -f "$BASE_DIR/docker-compose.yml" ps --status running --quiet | grep -q . \
  || fail "container Coturn não está em execução"

ss -lntu | grep -Eq "[:.]${TURN_LISTENING_PORT}[[:space:]]" \
  || fail "listener TURN ${TURN_LISTENING_PORT} ausente"
ss -lnt | grep -Eq "[:.]${TURN_TLS_LISTENING_PORT}[[:space:]]" \
  || fail "listener TURNS ${TURN_TLS_LISTENING_PORT} ausente"

resolved_ip=$(
  getent ahostsv4 "$TURN_REALM" \
    | awk 'NR == 1 { print $1 }'
)
[ "$resolved_ip" = "$TURN_EXTERNAL_IP" ] \
  || fail "DNS do realm não aponta para o IPv4 público configurado"

tls_handshake=$(
  timeout 8 openssl s_client \
    -connect "127.0.0.1:${TURN_TLS_LISTENING_PORT}" \
    -servername "$TURN_REALM" \
    -verify_hostname "$TURN_REALM" \
    -verify_return_error </dev/null 2>/dev/null
) || fail "certificado TLS ausente, inválido ou não corresponde ao realm"

printf '%s\n' "$tls_handshake" \
  | openssl x509 -noout -checkend 604800 >/dev/null 2>&1 \
  || fail "certificado TLS expira em menos de 7 dias"

docker compose -f "$BASE_DIR/docker-compose.yml" exec -T coturn \
  turnutils_stunclient -p "$TURN_LISTENING_PORT" 127.0.0.1 >/dev/null 2>&1 \
  || fail "probe STUN local falhou"

printf '%s\n' "Coturn em execução, listeners ativos, TLS válido e probe STUN aprovado."
printf '%s\n' "Faixa UDP de relay esperada: ${TURN_MIN_PORT}-${TURN_MAX_PORT}."
