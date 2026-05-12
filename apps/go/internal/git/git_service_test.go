package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestServiceAddFilesStagesSelectedFiles(t *testing.T) {
	repo := newTestRepo(t)
	writeFile(t, repo, "tracked.txt", "hello\nworld\n")
	gitTest(t, repo, "add", "tracked.txt")
	gitTest(t, repo, "commit", "-m", "initial")

	writeFile(t, repo, "tracked.txt", "hello\nupdated\n")

	svc := NewService(repo)
	result := svc.AddFiles([]string{"tracked.txt"})
	if !result.Success {
		t.Fatalf("expected add files to succeed: %s", result.Error)
	}

	assertHasStatus(t, result.Data.Status.Staged, "tracked.txt", "modified")
	if len(result.Data.Status.Unstaged) != 0 {
		t.Fatalf("expected no unstaged changes after staging, got %+v", result.Data.Status.Unstaged)
	}
}

func TestServiceUnstageFilesRestoresWorktreeStatus(t *testing.T) {
	repo := newTestRepo(t)
	writeFile(t, repo, "tracked.txt", "hello\nworld\n")
	gitTest(t, repo, "add", "tracked.txt")
	gitTest(t, repo, "commit", "-m", "initial")

	writeFile(t, repo, "tracked.txt", "hello\nupdated\n")

	svc := NewService(repo)
	if result := svc.AddFiles([]string{"tracked.txt"}); !result.Success {
		t.Fatalf("expected add files to succeed: %s", result.Error)
	}

	result := svc.UnstageFiles([]string{"tracked.txt"})
	if !result.Success {
		t.Fatalf("expected unstage files to succeed: %s", result.Error)
	}

	if len(result.Data.Status.Staged) != 0 {
		t.Fatalf("expected no staged changes after unstage, got %+v", result.Data.Status.Staged)
	}
	assertHasStatus(t, result.Data.Status.Unstaged, "tracked.txt", "modified")
}

func TestServiceCommitCreatesCommitAndReturnsHash(t *testing.T) {
	repo := newTestRepo(t)
	writeFile(t, repo, "tracked.txt", "hello\nworld\n")
	gitTest(t, repo, "add", "tracked.txt")
	gitTest(t, repo, "commit", "-m", "initial")

	writeFile(t, repo, "tracked.txt", "hello\nupdated\n")

	svc := NewService(repo)
	if result := svc.AddFiles([]string{"tracked.txt"}); !result.Success {
		t.Fatalf("expected add files to succeed: %s", result.Error)
	}

	result := svc.Commit("update tracked file", nil)
	if !result.Success {
		t.Fatalf("expected commit to succeed: %s", result.Error)
	}

	if len(strings.TrimSpace(result.Data.Hash)) != 40 {
		t.Fatalf("expected 40-char commit hash, got %q", result.Data.Hash)
	}
	if len(result.Data.Status.Staged) != 0 || len(result.Data.Status.Unstaged) != 0 {
		t.Fatalf("expected clean working tree after commit, got %+v", result.Data.Status)
	}
}

func TestServiceFetchHandlesRemoteUpdatesAndAlreadyUpToDate(t *testing.T) {
	baseDir := t.TempDir()
	sourceRepo := filepath.Join(baseDir, "source")
	remoteRepo := filepath.Join(baseDir, "remote.git")
	localClone := filepath.Join(baseDir, "clone")

	createTestRepo(t, sourceRepo)
	writeFile(t, sourceRepo, "tracked.txt", "hello\n")
	gitTest(t, sourceRepo, "add", "tracked.txt")
	gitTest(t, sourceRepo, "commit", "-m", "initial")
	gitTest(t, baseDir, "clone", "--bare", sourceRepo, remoteRepo)
	gitTest(t, baseDir, "clone", remoteRepo, localClone)

	writeFile(t, sourceRepo, "tracked.txt", "hello\nworld\n")
	gitTest(t, sourceRepo, "add", "tracked.txt")
	gitTest(t, sourceRepo, "commit", "-m", "update remote")
	gitTest(t, sourceRepo, "push", remoteRepo, "main")

	svc := NewService(localClone)
	result := svc.Fetch("origin")
	if !result.Success {
		t.Fatalf("expected fetch to succeed: %s", result.Error)
	}

	localHead := gitOutput(t, localClone, "rev-parse", "origin/main")
	remoteHead := gitOutput(t, sourceRepo, "rev-parse", "HEAD")
	if localHead != remoteHead {
		t.Fatalf("expected fetched remote head %q, got %q", remoteHead, localHead)
	}

	second := svc.Fetch("origin")
	if !second.Success {
		t.Fatalf("expected second fetch to succeed: %s", second.Error)
	}
}

func newTestRepo(t *testing.T) string {
	t.Helper()

	repo := filepath.Join(t.TempDir(), "repo")
	createTestRepo(t, repo)
	return repo
}

func createTestRepo(t *testing.T, dir string) {
	t.Helper()

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	gitTest(t, dir, "init", "-b", "main")
	gitTest(t, dir, "config", "user.name", "Test User")
	gitTest(t, dir, "config", "user.email", "test@example.com")
}

func writeFile(t *testing.T, repo string, relativePath string, contents string) {
	t.Helper()

	fullPath := filepath.Join(repo, relativePath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("mkdir parent for %s: %v", fullPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(contents), 0o644); err != nil {
		t.Fatalf("write file %s: %v", fullPath, err)
	}
}

func gitOutput(t *testing.T, cwd string, args ...string) string {
	t.Helper()

	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	cmd.Env = append(cmd.Environ(),
		"GIT_TERMINAL_PROMPT=0",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, string(out))
	}
	return strings.TrimSpace(string(out))
}

func gitTest(t *testing.T, cwd string, args ...string) {
	t.Helper()
	_ = gitOutput(t, cwd, args...)
}
