package bridge

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"relaid/internal/nodejs"
)

type State string

const (
	StateStopped  State = "stopped"
	StateStarting State = "starting"
	StateRunning  State = "running"
	StateFailed   State = "failed"
)

type Status struct {
	Installed  bool   `json:"installed"`
	Running    bool   `json:"running"`
	State      State  `json:"state"`
	PID        int    `json:"pid,omitempty"`
	Entrypoint string `json:"entrypoint"`
	Error      string `json:"error,omitempty"`
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcNotification struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type Manager struct {
	node   *nodejs.Manager
	logger *log.Logger

	mu        sync.Mutex
	status    Status
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	nextID    int64
	pending   map[int64]chan rpcResponse
	writeMu   sync.Mutex
	assetRoot string

	notificationMu       sync.Mutex
	notificationNextID   int64
	notificationHandlers map[string]map[int64]func(json.RawMessage)
}

func NewManager(node *nodejs.Manager, logger *log.Logger) *Manager {
	if logger == nil {
		logger = log.Default()
	}
	return &Manager{
		node:    node,
		logger:  logger,
		status:  Status{State: StateStopped},
		pending: map[int64]chan rpcResponse{},
		notificationHandlers: map[string]map[int64]func(json.RawMessage){},
	}
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

func (m *Manager) Start(ctx context.Context) (Status, error) {
	nodeStatus, err := m.node.ResolveBinary(ctx)
	if err != nil {
		status := Status{
			Installed: false,
			Running:   false,
			State:     StateFailed,
			Error:     err.Error(),
		}
		m.setStatus(status)
		return status, err
	}

	m.mu.Lock()
	if m.cmd != nil && m.status.Running {
		status := m.status
		m.mu.Unlock()
		return status, nil
	}
	m.status = Status{Installed: true, State: StateStarting}
	m.mu.Unlock()

	entrypoint, err := m.ensureAssets()
	if err != nil {
		status := Status{
			Installed:  true,
			Running:    false,
			State:      StateFailed,
			Entrypoint: entrypoint,
			Error:      err.Error(),
		}
		m.setStatus(status)
		return status, err
	}

	// The bridge is a long-lived sidecar process. Do not bind its lifetime to the
	// startup/request context, or it will be killed when the caller's timeout expires.
	cmd := exec.Command(nodeStatus.BinaryPath, entrypoint, "--transport", "stdio")
	cmd.Dir = filepath.Dir(entrypoint)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		status := Status{Installed: true, Running: false, State: StateFailed, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		status := Status{Installed: true, Running: false, State: StateFailed, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		status := Status{Installed: true, Running: false, State: StateFailed, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}

	if err := cmd.Start(); err != nil {
		status := Status{Installed: true, Running: false, State: StateFailed, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}

	m.mu.Lock()
	m.cmd = cmd
	m.stdin = stdin
	m.pending = map[int64]chan rpcResponse{}
	m.status = Status{
		Installed:  true,
		Running:    false,
		State:      StateStarting,
		PID:        cmd.Process.Pid,
		Entrypoint: entrypoint,
	}
	m.mu.Unlock()

	go m.readStdout(stdout)
	go m.readStderr(stderr)
	go m.waitForExit(cmd)

	startCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var initResult map[string]any
	if err := m.call(startCtx, "initialize", map[string]any{
		"protocolVersion": 1,
		"name":            "relaid-go",
		"version":         "0.0.1",
	}, &initResult); err != nil {
		_ = m.kill()
		status := Status{Installed: true, Running: false, State: StateFailed, PID: cmd.Process.Pid, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}

	var healthResult map[string]any
	if err := m.call(startCtx, "health/check", map[string]any{}, &healthResult); err != nil {
		_ = m.kill()
		status := Status{Installed: true, Running: false, State: StateFailed, PID: cmd.Process.Pid, Entrypoint: entrypoint, Error: err.Error()}
		m.setStatus(status)
		return status, err
	}

	status := Status{
		Installed:  true,
		Running:    true,
		State:      StateRunning,
		PID:        cmd.Process.Pid,
		Entrypoint: entrypoint,
	}
	m.setStatus(status)
	return status, nil
}

func (m *Manager) Call(ctx context.Context, method string, params any, out any) error {
	status := m.Status()
	if !status.Running {
		if _, err := m.Start(ctx); err != nil {
			return err
		}
	}
	return m.call(ctx, method, params, out)
}

func (m *Manager) Subscribe(method string, handler func(json.RawMessage)) func() {
	if handler == nil {
		return func() {}
	}
	id := atomic.AddInt64(&m.notificationNextID, 1)
	m.notificationMu.Lock()
	if m.notificationHandlers[method] == nil {
		m.notificationHandlers[method] = map[int64]func(json.RawMessage){}
	}
	m.notificationHandlers[method][id] = handler
	m.notificationMu.Unlock()

	return func() {
		m.notificationMu.Lock()
		defer m.notificationMu.Unlock()
		handlers := m.notificationHandlers[method]
		if handlers == nil {
			return
		}
		delete(handlers, id)
		if len(handlers) == 0 {
			delete(m.notificationHandlers, method)
		}
	}
}

func (m *Manager) Stop(ctx context.Context) (Status, error) {
	m.mu.Lock()
	cmd := m.cmd
	m.mu.Unlock()

	if cmd == nil {
		status := Status{Installed: true, Running: false, State: StateStopped}
		m.setStatus(status)
		return status, nil
	}

	stopCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_ = m.call(stopCtx, "bridge/shutdown", map[string]any{}, nil)
	_ = m.kill()

	status := Status{Installed: true, Running: false, State: StateStopped}
	m.setStatus(status)
	return status, nil
}

func (m *Manager) ensureAssets() (string, error) {
	m.mu.Lock()
	if m.assetRoot != "" {
		entrypoint := filepath.Join(m.assetRoot, "index.mjs")
		if _, err := os.Stat(entrypoint); err != nil {
			entrypoint = filepath.Join(m.assetRoot, "index.js")
		}
		m.mu.Unlock()
		return entrypoint, nil
	}
	m.mu.Unlock()

	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	targetDir := filepath.Join(configDir, "relaid", "runtime", "bridge")
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", err
	}

	entries, err := bootstrapFS.ReadDir("bootstrap/dist")
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		content, err := bootstrapFS.ReadFile(filepath.ToSlash(filepath.Join("bootstrap/dist", entry.Name())))
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(filepath.Join(targetDir, entry.Name()), content, 0o644); err != nil {
			return "", err
		}
	}

	entrypoint := filepath.Join(targetDir, "index.mjs")
	if _, err := os.Stat(entrypoint); err != nil {
		entrypoint = filepath.Join(targetDir, "index.js")
	}
	m.mu.Lock()
	m.assetRoot = targetDir
	m.mu.Unlock()
	return entrypoint, nil
}

func (m *Manager) kill() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd == nil || m.cmd.Process == nil {
		return nil
	}
	err := m.cmd.Process.Kill()
	m.cmd = nil
	m.stdin = nil
	m.pending = map[int64]chan rpcResponse{}
	return err
}

func (m *Manager) waitForExit(cmd *exec.Cmd) {
	err := cmd.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd != cmd {
		return
	}
	m.cmd = nil
	m.stdin = nil
	for id, pending := range m.pending {
		close(pending)
		delete(m.pending, id)
	}
	m.status.Running = false
	if m.status.State != StateStopped {
		m.status.State = StateFailed
		if err != nil {
			m.status.Error = err.Error()
		}
	}
}

func (m *Manager) readStdout(r io.Reader) {
	scanner := bufio.NewScanner(r)
	buffer := make([]byte, 0, 64*1024)
	scanner.Buffer(buffer, 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			m.logger.Printf("bridge stdout parse error: %v", err)
			continue
		}

		if _, ok := envelope["method"]; ok {
			var note rpcNotification
			if err := json.Unmarshal([]byte(line), &note); err != nil {
				m.logger.Printf("bridge notification parse error: %v", err)
				continue
			}
			m.dispatchNotification(note.Method, note.Params)
			continue
		}

		var resp rpcResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			m.logger.Printf("bridge stdout response parse error: %v", err)
			continue
		}
		if resp.ID == 0 {
			continue
		}

		m.mu.Lock()
		ch := m.pending[resp.ID]
		delete(m.pending, resp.ID)
		m.mu.Unlock()
		if ch != nil {
			ch <- resp
			close(ch)
		}
	}
}

func (m *Manager) dispatchNotification(method string, params json.RawMessage) {
	m.notificationMu.Lock()
	handlersMap := m.notificationHandlers[method]
	handlers := make([]func(json.RawMessage), 0, len(handlersMap))
	for _, handler := range handlersMap {
		handlers = append(handlers, handler)
	}
	m.notificationMu.Unlock()

	for _, handler := range handlers {
		handler(params)
	}
}

func (m *Manager) readStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	buffer := make([]byte, 0, 64*1024)
	scanner.Buffer(buffer, 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			m.logger.Printf("node-bridge: %s", line)
		}
	}
}

func (m *Manager) call(ctx context.Context, method string, params any, out any) error {
	id := atomic.AddInt64(&m.nextID, 1)
	payload, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return err
	}

	ch := make(chan rpcResponse, 1)
	m.mu.Lock()
	if m.stdin == nil {
		m.mu.Unlock()
		return fmt.Errorf("bridge is not running")
	}
	m.pending[id] = ch
	stdin := m.stdin
	m.mu.Unlock()

	m.writeMu.Lock()
	_, err = stdin.Write(append(payload, '\n'))
	m.writeMu.Unlock()
	if err != nil {
		return err
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case resp, ok := <-ch:
		if !ok {
			return fmt.Errorf("bridge request %s was interrupted", method)
		}
		if resp.Error != nil {
			return resp.Error
		}
		if out != nil && len(resp.Result) > 0 {
			return json.Unmarshal(resp.Result, out)
		}
		return nil
	}
}

func (m *Manager) setStatus(status Status) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status = status
}
