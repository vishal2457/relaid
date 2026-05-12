package git

import "testing"

func TestParsePorcelainStatus(t *testing.T) {
	output := "## main...origin/main [ahead 1]\nM  staged.txt\n M unstaged.txt\nR  old.txt -> new.txt\nD  deleted.txt\n?? untracked.txt\n"

	status := parsePorcelainStatus(output)

	if status.Branch != "main" {
		t.Fatalf("expected branch main, got %q", status.Branch)
	}

	assertHasStatus(t, status.Staged, "staged.txt", "modified")
	assertHasStatus(t, status.Staged, "new.txt", "renamed")
	assertHasStatus(t, status.Staged, "deleted.txt", "deleted")
	assertHasStatus(t, status.Unstaged, "unstaged.txt", "modified")
	assertHasStatus(t, status.Unstaged, "untracked.txt", "untracked")
}

func TestParsePorcelainStatusCleanRepo(t *testing.T) {
	status := parsePorcelainStatus("## main\n")

	if status.Branch != "main" {
		t.Fatalf("expected branch main, got %q", status.Branch)
	}
	if len(status.Staged) != 0 || len(status.Unstaged) != 0 {
		t.Fatalf("expected clean status, got staged=%d unstaged=%d", len(status.Staged), len(status.Unstaged))
	}
}

func TestParsePorcelainStatusDetachedHead(t *testing.T) {
	status := parsePorcelainStatus("## HEAD (detached at abc1234)\n")

	if status.Branch != "HEAD" {
		t.Fatalf("expected detached branch HEAD, got %q", status.Branch)
	}
}

func assertHasStatus(t *testing.T, files []FileWithStatus, path string, expected string) {
	t.Helper()

	for _, file := range files {
		if file.Path == path {
			if file.Status != expected {
				t.Fatalf("expected %s to have status %q, got %q", path, expected, file.Status)
			}
			return
		}
	}

	t.Fatalf("expected status for %s not found", path)
}
