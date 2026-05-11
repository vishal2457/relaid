package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadResolvesOpenCodeFromUserInstallWhenPathIsLimited(t *testing.T) {
	home := t.TempDir()
	binDir := filepath.Join(home, ".opencode", "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}

	opencodeBin := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(opencodeBin, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", "/usr/bin:/bin")
	t.Setenv("OPENCODE_BIN", "")

	cfg := Load()
	if cfg.OpencodeBin != opencodeBin {
		t.Fatalf("expected opencode bin %q, got %q", opencodeBin, cfg.OpencodeBin)
	}
}

func TestLoadKeepsExplicitOpenCodeBin(t *testing.T) {
	t.Setenv("OPENCODE_BIN", "/custom/opencode")

	cfg := Load()
	if cfg.OpencodeBin != "/custom/opencode" {
		t.Fatalf("expected explicit opencode bin, got %q", cfg.OpencodeBin)
	}
}

func TestLoadResolvesCodexFromNewestNVMInstallWhenPathIsLimited(t *testing.T) {
	home := t.TempDir()
	olderBin := filepath.Join(home, ".nvm", "versions", "node", "v20.11.0", "bin", "codex")
	newerBin := filepath.Join(home, ".nvm", "versions", "node", "v25.9.0", "bin", "codex")
	for _, path := range []string{olderBin, newerBin} {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("#!/usr/bin/env node\n"), 0755); err != nil {
			t.Fatal(err)
		}
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", "/usr/bin:/bin")
	t.Setenv("CODEX_BIN", "")

	cfg := Load()
	if cfg.CodexBin != newerBin {
		t.Fatalf("expected codex bin %q, got %q", newerBin, cfg.CodexBin)
	}
}

func TestLoadKeepsExplicitCodexBin(t *testing.T) {
	t.Setenv("CODEX_BIN", "/custom/codex")

	cfg := Load()
	if cfg.CodexBin != "/custom/codex" {
		t.Fatalf("expected explicit codex bin, got %q", cfg.CodexBin)
	}
}

func TestLoadPrefersAnthropicAPIKeyForClaude(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "anthropic-key")
	t.Setenv("CLAUDE_API_KEY", "claude-key")

	cfg := Load()
	if cfg.ClaudeAPIKey != "anthropic-key" {
		t.Fatalf("expected anthropic api key, got %q", cfg.ClaudeAPIKey)
	}
}

func TestLoadUsesClaudeAPIKeyFallback(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("CLAUDE_API_KEY", "claude-key")

	cfg := Load()
	if cfg.ClaudeAPIKey != "claude-key" {
		t.Fatalf("expected claude api key fallback, got %q", cfg.ClaudeAPIKey)
	}
}
