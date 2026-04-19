package opencode

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type ServerManager struct {
	bin      string
	cwd      string
	logger   *log.Logger
	cmd      *exec.Cmd
	url      string
	mu       sync.Mutex
	shutdown func()
}

func NewServerManager(bin, cwd string, logger *log.Logger) *ServerManager {
	return &ServerManager{bin: bin, cwd: cwd, logger: logger}
}

func (sm *ServerManager) Start(ctx context.Context) (string, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.url != "" {
		if sm.checkHealth(sm.url) {
			return sm.url, nil
		}
		sm.stopLocked()
	}

	port, err := findFreePort()
	if err != nil {
		return "", fmt.Errorf("find free port: %w", err)
	}

	sm.logger.Printf("opencode: starting server on port %d", port)

	cmd := exec.Command(sm.bin, "serve",
		"--port", fmt.Sprintf("%d", port),
		"--hostname", "127.0.0.1",
	)
	cmd.Dir = sm.cwd

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("stderr pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start opencode serve: %w", err)
	}

	sm.logger.Printf("opencode: server pid %d", cmd.Process.Pid)
	go sm.logOutput("stdout", stdout)
	go sm.logStderr(stderr)

	serverCtx, cancel := context.WithCancel(context.Background())
	sm.cmd = cmd
	sm.shutdown = cancel

	go func() {
		err := cmd.Wait()
		sm.mu.Lock()
		defer sm.mu.Unlock()
		if sm.cmd == cmd {
			sm.cmd = nil
			sm.url = ""
			sm.shutdown = nil
		}
		cancel()
		if err != nil && serverCtx.Err() == nil {
			sm.logger.Printf("opencode: server exited: %v", err)
		}
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	waitCtx := serverCtx
	if ctx != nil {
		var stopWaiting context.CancelFunc
		waitCtx, stopWaiting = context.WithCancel(serverCtx)
		go func() {
			select {
			case <-ctx.Done():
				stopWaiting()
			case <-serverCtx.Done():
				stopWaiting()
			}
		}()
		defer stopWaiting()
	}

	if err := sm.waitHealthy(waitCtx, url); err != nil {
		sm.stopLocked()
		return "", fmt.Errorf("server health check: %w", err)
	}

	sm.url = url
	sm.logger.Printf("opencode: server ready at %s", url)
	return url, nil
}

func (sm *ServerManager) Stop() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.stopLocked()
}

func (sm *ServerManager) stopLocked() {
	if sm.shutdown != nil {
		sm.shutdown()
		sm.shutdown = nil
	}
	if sm.cmd != nil && sm.cmd.Process != nil {
		_ = sm.cmd.Process.Kill()
		sm.cmd = nil
	}
	sm.url = ""
}

func (sm *ServerManager) URL() string {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.url
}

func (sm *ServerManager) checkHealth(url string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url+"/health", nil)
	if err != nil {
		return false
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (sm *ServerManager) waitHealthy(ctx context.Context, url string) error {
	healthURL := url + "/health"
	delay := 200 * time.Millisecond

	for i := 0; i < 150; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err != nil {
			continue
		}

		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}

		if delay < 2*time.Second {
			delay += 200 * time.Millisecond
		}
	}

	return fmt.Errorf("server at %s not healthy after timeout", url)
}

func (sm *ServerManager) logStderr(r io.Reader) {
	sm.logOutput("stderr", r)
}

func (sm *ServerManager) logOutput(stream string, r io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			line := strings.TrimRight(string(buf[:n]), "\n")
			if line != "" {
				sm.logger.Printf("opencode %s: %s", stream, line)
			}
		}
		if err != nil {
			return
		}
	}
}

func findFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return port, nil
}
