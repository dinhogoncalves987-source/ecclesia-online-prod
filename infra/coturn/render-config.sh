#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${1:-"$BASE_DIR/turn.env"}
STATE_DIR="$BASE_DIR/state"
OUTPUT_FILE="$STATE_DIR/turnserver.conf"
TEMPLATE_FILE="$BASE_DIR/turnserver.conf.template"

fail() {
  printf '%s\n' "ERRO: $1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "execute como root no servidor TURN"
[ -f "$ENV_FILE" ] || fail "arquivo turn.env ausente"
[ -f "$TEMPLATE_FILE" ] || fail "template do Coturn ausente"

# turn.env pertence ao operador da VPS. Seus valores são validados abaixo e
# nunca são escritos em stdout.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

required_vars="
TURN_ENVIRONMENT
TURN_REALM
TURN_EXTERNAL_IP
TURN_LISTENING_PORT
TURN_TLS_LISTENING_PORT
TURN_MIN_PORT
TURN_MAX_PORT
TURN_TLS_CERT
TURN_TLS_KEY
TURN_SHARED_SECRET
"

for variable in $required_vars; do
  eval "value=\${$variable:-}"
  [ -n "$value" ] || fail "$variable não configurada"
done

case "$TURN_ENVIRONMENT" in
  staging|production) ;;
  *) fail "TURN_ENVIRONMENT deve ser staging ou production" ;;
esac

case "$TURN_REALM" in
  *.ecclesiabr.online) ;;
  *) fail "TURN_REALM deve pertencer a ecclesiabr.online" ;;
esac

case "$TURN_EXTERNAL_IP" in
  *[!0-9.]*|"") fail "TURN_EXTERNAL_IP deve ser IPv4 público" ;;
esac

for port_variable in TURN_LISTENING_PORT TURN_TLS_LISTENING_PORT TURN_MIN_PORT TURN_MAX_PORT; do
  eval "port_value=\${$port_variable}"
  case "$port_value" in
    *[!0-9]*|"") fail "$port_variable inválida" ;;
  esac
  [ "$port_value" -ge 1 ] && [ "$port_value" -le 65535 ] \
    || fail "$port_variable fora da faixa"
done

[ "$TURN_MIN_PORT" -le "$TURN_MAX_PORT" ] || fail "faixa de relay invertida"
[ $((TURN_MAX_PORT - TURN_MIN_PORT + 1)) -ge 100 ] \
  || fail "reserve pelo menos 100 portas UDP para relay"

case "$TURN_SHARED_SECRET" in
  *[!A-Za-z0-9_-]*) fail "TURN_SHARED_SECRET deve usar somente base64url" ;;
esac
[ "${#TURN_SHARED_SECRET}" -ge 48 ] || fail "TURN_SHARED_SECRET deve ter no mínimo 48 caracteres"

case "$TURN_TLS_CERT" in
  /etc/letsencrypt/*) ;;
  *) fail "TURN_TLS_CERT deve estar sob /etc/letsencrypt" ;;
esac
case "$TURN_TLS_KEY" in
  /etc/letsencrypt/*) ;;
  *) fail "TURN_TLS_KEY deve estar sob /etc/letsencrypt" ;;
esac
[ -r "$TURN_TLS_CERT" ] || fail "certificado TLS não legível"
[ -r "$TURN_TLS_KEY" ] || fail "chave TLS não legível"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

escape_sed() {
  printf '%s' "$1" | sed 's/[|&\\]/\\&/g'
}

sed \
  -e "s|__TURN_LISTENING_PORT__|$(escape_sed "$TURN_LISTENING_PORT")|g" \
  -e "s|__TURN_TLS_LISTENING_PORT__|$(escape_sed "$TURN_TLS_LISTENING_PORT")|g" \
  -e "s|__TURN_EXTERNAL_IP__|$(escape_sed "$TURN_EXTERNAL_IP")|g" \
  -e "s|__TURN_MIN_PORT__|$(escape_sed "$TURN_MIN_PORT")|g" \
  -e "s|__TURN_MAX_PORT__|$(escape_sed "$TURN_MAX_PORT")|g" \
  -e "s|__TURN_REALM__|$(escape_sed "$TURN_REALM")|g" \
  -e "s|__TURN_SHARED_SECRET__|$(escape_sed "$TURN_SHARED_SECRET")|g" \
  -e "s|__TURN_TLS_CERT__|$(escape_sed "$TURN_TLS_CERT")|g" \
  -e "s|__TURN_TLS_KEY__|$(escape_sed "$TURN_TLS_KEY")|g" \
  "$TEMPLATE_FILE" > "$OUTPUT_FILE"

chmod 600 "$OUTPUT_FILE"

if grep -Eq '__[A-Z0-9_]+__' "$OUTPUT_FILE"; then
  fail "configuração renderizada contém placeholders"
fi

docker compose -f "$BASE_DIR/docker-compose.yml" config --quiet
printf '%s\n' "Configuração TURN validada para $TURN_ENVIRONMENT ($TURN_REALM)."
printf '%s\n' "Nenhum segredo foi exibido."
