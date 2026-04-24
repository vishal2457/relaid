#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
OUTPUT_DIR="/Users/vishalacharya/Documents/derived/google-drive/relaid"

# Bump patch version in package.json
cd "$PROJECT_DIR"
NEW_VERSION=$(node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const parts = pkg.version.split('.');
parts[2] = parseInt(parts[2], 10) + 1;
pkg.version = parts.join('.');
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(pkg.version);
")

APK_NAME="${NEW_VERSION}-relaid.apk"

echo "Building release APK (version: $NEW_VERSION)..."

cd "$PROJECT_DIR/android"
./gradlew assembleRelease

APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"

if [ -f "$APK_PATH" ]; then
    echo "Copying APK to $OUTPUT_DIR/$APK_NAME..."
    mkdir -p "$OUTPUT_DIR"
    cp "$APK_PATH" "$OUTPUT_DIR/$APK_NAME"
    echo "Done! APK saved to $OUTPUT_DIR/$APK_NAME"
else
    echo "Error: APK not found at $APK_PATH"
    exit 1
fi