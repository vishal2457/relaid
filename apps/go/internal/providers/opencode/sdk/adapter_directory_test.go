package sdk

import (
	"context"
	"path/filepath"
	"testing"
)

func TestEnsureProjectDirectoryAcceptsExistingDirectory(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	adapter := New("", "/workspace")

	got, err := adapter.EnsureProjectDirectory(context.Background(), dir, "")
	if err != nil {
		t.Fatalf("EnsureProjectDirectory returned error: %v", err)
	}

	want, err := filepath.Abs(dir)
	if err != nil {
		t.Fatalf("filepath.Abs returned error: %v", err)
	}
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestEnsureProjectDirectoryPrefersWorkingDir(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	adapter := New("", "/workspace")

	got, err := adapter.EnsureProjectDirectory(context.Background(), "ignored-project-id", dir)
	if err != nil {
		t.Fatalf("EnsureProjectDirectory returned error: %v", err)
	}
	if got != dir {
		t.Fatalf("expected working dir %q, got %q", dir, got)
	}
}
