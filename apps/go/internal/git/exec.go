package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const (
	defaultGitTimeout = 10 * time.Second
	statusGitTimeout  = 5 * time.Second
	mutateGitTimeout  = 10 * time.Second
	networkGitTimeout = 60 * time.Second
)

type gitCommandResult struct {
	Stdout string
	Stderr string
}

func runGit(cwd string, args ...string) (string, error) {
	result, err := runGitDetailed(cwd, defaultGitTimeout, args...)
	if err != nil {
		return result.Stderr, err
	}
	return result.Stdout, nil
}

func runGitWithTimeout(cwd string, timeout time.Duration, args ...string) (string, error) {
	result, err := runGitDetailed(cwd, timeout, args...)
	if err != nil {
		return result.Stderr, err
	}
	return result.Stdout, nil
}

func runGitDetailed(cwd string, timeout time.Duration, args ...string) (gitCommandResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = cwd
	cmd.Env = append(cmd.Environ(),
		"GIT_TERMINAL_PROMPT=0",
		"GIT_OPTIONAL_LOCKS=0",
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	result := gitCommandResult{
		Stdout: strings.TrimSpace(stdout.String()),
		Stderr: strings.TrimSpace(stderr.String()),
	}

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return result, fmt.Errorf("git %s: timeout after %v", strings.Join(args, " "), timeout)
		}
		return result, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, stderr.String())
	}

	result.Stdout = strings.TrimSpace(stdout.String())
	result.Stderr = strings.TrimSpace(stderr.String())
	return result, nil
}
