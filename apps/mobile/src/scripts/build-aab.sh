#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
OUTPUT_DIR="$PROJECT_DIR/builds"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_PATH="$OUTPUT_DIR/relaid-${TIMESTAMP}.aab"

cd "$PROJECT_DIR"

if ! command -v eas >/dev/null 2>&1; then
  echo "Error: eas CLI is not installed."
  echo "Install it with: npm install -g eas-cli"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Building Play App Bundle with local EAS production profile..."
echo "This uses Expo remote Android credentials and writes the final AAB to $OUTPUT_PATH"

BEFORE_BUILD_FILES="$(find "$PROJECT_DIR" -maxdepth 1 -type f -name 'build-*.aab' -print)"

eas build --platform android --profile production --local --non-interactive

LATEST_AAB="$(find "$PROJECT_DIR" -maxdepth 1 -type f -name 'build-*.aab' -print | while read -r file; do
  if ! printf '%s\n' "$BEFORE_BUILD_FILES" | grep -Fxq "$file"; then
    printf '%s\n' "$file"
  fi
done | tail -n 1)"

if [ -z "$LATEST_AAB" ]; then
  LATEST_AAB="$(find "$PROJECT_DIR" -maxdepth 1 -type f -name 'build-*.aab' -print | sort | tail -n 1)"
fi

if [ ! -f "$LATEST_AAB" ]; then
  echo "Error: could not find the generated AAB in $PROJECT_DIR"
  exit 1
fi

cp "$LATEST_AAB" "$OUTPUT_PATH"

echo "Done! AAB saved to $OUTPUT_PATH"
echo "Original EAS artifact: $LATEST_AAB"
