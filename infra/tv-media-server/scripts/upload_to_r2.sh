#!/usr/bin/env bash
# upload_to_r2.sh — Upload de arquivo para Cloudflare R2 via AWS CLI (S3-compatible).
#
# Uso: bash upload_to_r2.sh <local_file> <bucket> <r2_key> [content_type]
#
# Pré-requisitos:
#   - AWS CLI instalado: apt-get install awscli  ou pip install awscli
#   - Variáveis de ambiente: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

set -e

LOCAL_FILE="$1"
BUCKET="$2"
R2_KEY="$3"
CONTENT_TYPE="${4:-application/octet-stream}"

LOG_PREFIX="[upload_to_r2.sh]"

if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

# Verificar credenciais
if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo "$LOG_PREFIX ERROR: R2 credentials not set in environment"
  exit 1
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo "$LOG_PREFIX ERROR: local file not found: $LOCAL_FILE"
  exit 1
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "$LOG_PREFIX Uploading $LOCAL_FILE → s3://$BUCKET/$R2_KEY"
echo "$LOG_PREFIX Endpoint: $R2_ENDPOINT"

# Configurar AWS CLI para usar R2 (variáveis temporárias de sessão)
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION="auto" \
aws s3 cp \
  "$LOCAL_FILE" \
  "s3://${BUCKET}/${R2_KEY}" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type "$CONTENT_TYPE" \
  --no-progress \
  2>&1

echo "$LOG_PREFIX Upload complete: ${R2_PUBLIC_URL:-https://media.ecclesia.com.br}/${R2_KEY}"
