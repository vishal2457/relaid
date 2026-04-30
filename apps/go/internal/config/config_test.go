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
