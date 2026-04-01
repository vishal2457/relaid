#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building standalone APK with EAS..."

cd "$PROJECT_DIR"

eas build --platform android --profile preview --local

APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    echo "Done! APK built at $APK_PATH"
else
    echo "Error: APK not found at $APK_PATH"
    exit 1
fi