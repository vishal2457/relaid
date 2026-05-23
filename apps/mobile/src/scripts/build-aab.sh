#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
WORKSPACE_DIR="$(dirname "$(dirname "$PROJECT_DIR")")"
OUTPUT_DIR="$PROJECT_DIR/builds"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_PATH="$OUTPUT_DIR/relaid-${TIMESTAMP}.aab"

if ! command -v eas >/dev/null 2>&1; then
  echo "Error: eas CLI is not installed."
  echo "Install it with: npm install -g eas-cli"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is not installed."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Building Play App Bundle with local EAS production profile..."
echo "This uses Expo remote Android credentials and writes the final AAB to $OUTPUT_PATH"

echo "Validating workspace lockfile before starting EAS..."
pnpm --dir "$WORKSPACE_DIR" install --frozen-lockfile
echo "Workspace lockfile is in sync."

cd "$PROJECT_DIR"

eas build \
  --platform android \
  --profile production \
  --local \
  --non-interactive \
  --output "$OUTPUT_PATH"

echo "Done! AAB saved to $OUTPUT_PATH"
