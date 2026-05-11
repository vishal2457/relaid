package nodejs

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseNodeVersion(t *testing.T) {
	version, major, err := parseNodeVersion("v22.12.0\n")
	if err != nil {
		t.Fatalf("parseNodeVersion returned error: %v", err)
	}
	if version != "v22.12.0" {
		t.Fatalf("unexpected version %q", version)
	}
	if major != 22 {
		t.Fatalf("unexpected major %d", major)
	}
}

func TestCompareSemver(t *testing.T) {
	if got := compareSemver("v22.10.0", "v22.9.0"); got <= 0 {
		t.Fatalf("expected v22.10.0 > v22.9.0, got %d", got)
	}
	if got := compareSemver("v20.0.0", "v20.0.0"); got != 0 {
		t.Fatalf("expected equal versions, got %d", got)
	}
}

func TestArtifactForCurrentPlatform(t *testing.T) {
	artifact, err := artifactFor("v22.22.2")
	if err != nil {
		t.Fatalf("artifactFor returned error: %v", err)
	}

	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "darwin/arm64":
		if artifact.fileName != "node-v22.22.2-darwin-arm64.tar.gz" {
			t.Fatalf("unexpected artifact %q", artifact.fileName)
		}
	case "darwin/amd64":
		if artifact.fileName != "node-v22.22.2-darwin-x64.tar.gz" {
			t.Fatalf("unexpected artifact %q", artifact.fileName)
		}
	case "linux/amd64":
		if artifact.fileName != "node-v22.22.2-linux-x64.tar.gz" {
			t.Fatalf("unexpected artifact %q", artifact.fileName)
		}
	case "windows/amd64":
		if artifact.fileName != "node-v22.22.2-win-x64.zip" {
			t.Fatalf("unexpected artifact %q", artifact.fileName)
		}
	default:
		t.Fatalf("test must be updated for %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

func TestResolvePrefersCompatibleSystemNode(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()
	nodePath := fakeNodeBinary(t, tmpDir, "v22.11.0")

	manager := NewManager(nil)
	manager.lookPath = func(name string) (string, error) {
		return nodePath, nil
	}

	status := manager.Status(ctx)
	if !status.Found || !status.Compatible {
		t.Fatalf("expected compatible node status, got %+v", status)
	}
	if status.Source != SourceSystem {
		t.Fatalf("expected system source, got %s", status.Source)
	}
}

func TestResolveFallsBackToManagedWhenSystemNodeIsTooOld(t *testing.T) {
	ctx := context.Background()
	rootDir := t.TempDir()
	systemDir := t.TempDir()
	systemNode := fakeNodeBinary(t, systemDir, "v18.20.0")
	managedVersion := "v22.22.2"
	managedDir := filepath.Join(rootDir, "managed", managedVersion)
	if err := os.MkdirAll(filepath.Join(managedDir, "bin"), 0o755); err != nil {
		t.Fatalf("mkdir managed dir: %v", err)
	}
	managedNode := fakeNodeBinaryAt(t, managedBinaryPath(managedDir), "v22.22.2")

	manager := NewManager(nil)
	manager.lookPath = func(name string) (string, error) {
		return systemNode, nil
	}
	manager.overrideDir = rootDir

	status := manager.resolve(ctx, rootDir)
	if status.Source != SourceManaged {
		t.Fatalf("expected managed source, got %+v", status)
	}
	if status.BinaryPath != managedNode {
		t.Fatalf("expected managed binary %q, got %q", managedNode, status.BinaryPath)
	}
	if !status.Compatible {
		t.Fatalf("expected compatible managed status, got %+v", status)
	}
}

func fakeNodeBinary(t *testing.T, dir string, version string) string {
	t.Helper()
	path := filepath.Join(dir, executableName("node"))
	return fakeNodeBinaryAt(t, path, version)
}

func fakeNodeBinaryAt(t *testing.T, path string, version string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	content := "#!/bin/sh\nprintf '%s\\n' \"" + version + "\"\n"
	if runtime.GOOS == "windows" {
		content = "@echo " + version + "\n"
	}
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write fake node: %v", err)
	}
	return path
}
