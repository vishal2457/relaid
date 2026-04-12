package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

func runGit(cwd string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return strings.TrimSpace(stderr.String()), fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}
