#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="/Users/vishalacharya/Documents/derived/google-drive/mx-mobile"

echo "Building release APK..."

cd "$PROJECT_DIR/android"
./gradlew assembleRelease

APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"

if [ -f "$APK_PATH" ]; then
    echo "Copying APK to $OUTPUT_DIR..."
    mkdir -p "$OUTPUT_DIR"
    cp "$APK_PATH" "$OUTPUT_DIR/app-release.apk"
    echo "Done! APK copied to $OUTPUT_DIR/app-release.apk"
else
    echo "Error: APK not found at $APK_PATH"
    exit 1
fi