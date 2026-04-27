#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
VERSION_FILE="$ROOT_DIR/apps/go/version.txt"

usage() {
  cat <<'EOF'
Usage:
  scripts/release-desktop.sh patch
  scripts/release-desktop.sh minor
  scripts/release-desktop.sh major
  scripts/release-desktop.sh X.Y.Z

This script:
  1. Bumps apps/go/version.txt
  2. Commits the version change
  3. Creates git tag vX.Y.Z
  4. Pushes the commit and tag to origin
  5. Publishes a GitHub release with generated notes

The desktop GitHub Actions workflow then builds and uploads release assets.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

bump_version() {
  local current="$1"
  local bump="$2"
  local major minor patch

  IFS='.' read -r major minor patch <<< "$current"

  case "$bump" in
    major)
      printf '%s.0.0\n' "$((major + 1))"
      ;;
    minor)
      printf '%s.%s.0\n' "$major" "$((minor + 1))"
      ;;
    patch)
      printf '%s.%s.%s\n' "$major" "$minor" "$((patch + 1))"
      ;;
    *)
      printf 'Unsupported bump type: %s\n' "$bump" >&2
      exit 1
      ;;
  esac
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

require_command git
require_command gh

INPUT="$1"

if [[ ! -f "$VERSION_FILE" ]]; then
  printf 'Version file not found: %s\n' "$VERSION_FILE" >&2
  exit 1
fi

CURRENT_VERSION=$(tr -d '[:space:]' < "$VERSION_FILE")

if ! is_semver "$CURRENT_VERSION"; then
  printf 'Current version is not valid semver: %s\n' "$CURRENT_VERSION" >&2
  exit 1
fi

if [[ "$INPUT" == "patch" || "$INPUT" == "minor" || "$INPUT" == "major" ]]; then
  NEXT_VERSION=$(bump_version "$CURRENT_VERSION" "$INPUT")
elif is_semver "$INPUT"; then
  NEXT_VERSION="$INPUT"
else
  printf 'Invalid release input: %s\n' "$INPUT" >&2
  usage
  exit 1
fi

if [[ "$NEXT_VERSION" == "$CURRENT_VERSION" ]]; then
  printf 'Next version matches current version: %s\n' "$CURRENT_VERSION" >&2
  exit 1
fi

TAG="v$NEXT_VERSION"

if [[ -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  printf 'Git worktree is not clean. Commit or stash changes before releasing.\n' >&2
  exit 1
fi

if ! git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
  printf 'Git remote "origin" is not configured.\n' >&2
  exit 1
fi

git -C "$ROOT_DIR" fetch --tags origin

if git -C "$ROOT_DIR" rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  printf 'Tag already exists locally: %s\n' "$TAG" >&2
  exit 1
fi

if [[ -n "$(git -C "$ROOT_DIR" ls-remote --tags origin "refs/tags/$TAG")" ]]; then
  printf 'Tag already exists on origin: %s\n' "$TAG" >&2
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  printf 'GitHub release already exists: %s\n' "$TAG" >&2
  exit 1
fi

gh auth status >/dev/null

printf '%s\n' "$NEXT_VERSION" > "$VERSION_FILE"

git -C "$ROOT_DIR" add apps/go/version.txt
git -C "$ROOT_DIR" commit -m "chore: release $TAG"
git -C "$ROOT_DIR" tag "$TAG"
git -C "$ROOT_DIR" push origin HEAD
git -C "$ROOT_DIR" push origin "$TAG"

gh release create "$TAG" --generate-notes

printf 'Published desktop release %s\n' "$TAG"
