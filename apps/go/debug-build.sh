#!/bin/bash


# Build the app
wails build -platform darwin -clean -debug -ldflags "-X main.Version=0.0.9 -X main.GitCommit=0.0.9 -X main.BuildDate=0.0.9 -X main.GitHubToken=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 -s -w" -tags production -trimpath


# Change to build directory
cd build/bin || { echo "Failed to change to build/bin directory"; exit 1; }

# Ensure Derived.app exists
if [ ! -d "Derived.app" ]; then
    echo "Error: Derived.app not found in $(pwd)"
    exit 1
fi

create-dmg 'Derived.app' --overwrite
