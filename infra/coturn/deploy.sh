#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${1:-"$BASE_DIR/turn.env"}

[ "$(id -u)" -eq 0 ] || {
  printf '%s\n' "ERRO: execute como root no servidor TURN" >&2
  exit 1
}

"$BASE_DIR/render-config.sh" "$ENV_FILE"
docker compose -f "$BASE_DIR/docker-compose.yml" pull --quiet
docker compose -f "$BASE_DIR/docker-compose.yml" up -d --remove-orphans

attempt=0
while [ "$attempt" -lt 10 ]; do
  if docker compose -f "$BASE_DIR/docker-compose.yml" ps --status running --quiet | grep -q .; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

"$BASE_DIR/verify-service.sh" "$ENV_FILE"
printf '%s\n' "Relay Eclésia implantado e verificado. Nenhum segredo foi exibido."
