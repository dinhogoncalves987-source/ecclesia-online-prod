#!/usr/bin/env bash
# generate_thumbnail.sh — Captura um frame do vídeo usando FFmpeg.
# Uso: bash generate_thumbnail.sh <session_id> <video_file_or_hls_url> <output_jpg>

set -e

SESSION_ID="$1"
VIDEO_SOURCE="$2"
OUTPUT_JPG="${3:-/tmp/ecclesia/thumb_${SESSION_ID}.jpg}"
OFFSET_SECONDS="${THUMBNAIL_OFFSET_SECONDS:-30}"

LOG_PREFIX="[generate_thumbnail.sh] $SESSION_ID"

if [ -f /scripts/.env ]; then
  # shellcheck disable=SC1091
  source /scripts/.env
fi

mkdir -p "$(dirname "$OUTPUT_JPG")"

echo "$LOG_PREFIX Generating thumbnail at t=${OFFSET_SECONDS}s from: $VIDEO_SOURCE"

# Tentar no offset preferido; se falhar, tentar em t=5s; se falhar, tentar t=0
for SEEK in "$OFFSET_SECONDS" "5" "0"; do
  if ffmpeg -y \
    -ss "$SEEK" \
    -i "$VIDEO_SOURCE" \
    -vframes 1 \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black" \
    -q:v 2 \
    "$OUTPUT_JPG" 2>/dev/null; then
    echo "$LOG_PREFIX Thumbnail generated at t=${SEEK}s → $OUTPUT_JPG"
    exit 0
  fi
done

echo "$LOG_PREFIX WARNING: could not generate thumbnail from $VIDEO_SOURCE"
exit 1
