package acp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os/exec"
	"sync"
	"sync/atomic"
)

const protocolVersion = 1

type Client struct {
	command string
	cwd     string
	logger  *log.Logger
}

type ClientInfo struct {
	Name    string `json:"name,omitempty"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version,omitempty"`
}

type SessionInfo struct {
	SessionID string `json:"sessionId"`
	Cwd       string `json:"cwd"`
	Title     string `json:"title,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type SessionListResult struct {
	Sessions   []SessionInfo `json:"sessions"`
	NextCursor string        `json:"nextCursor,omitempty"`
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type initializeParams struct {
	ProtocolVersion    int                `json:"protocolVersion"`
	ClientInfo         ClientInfo         `json:"clientInfo,omitempty"`
	ClientCapabilities clientCapabilities `json:"clientCapabilities"`
}

type clientCapabilities struct {
	FS       fsCapabilities `json:"fs"`
	Terminal bool           `json:"terminal"`
}

type fsCapabilities struct {
	ReadTextFile  bool `json:"readTextFile"`
	WriteTextFile bool `json:"writeTextFile"`
}

type initializeResult struct {
	ProtocolVersion   int               `json:"protocolVersion"`
	AgentCapabilities agentCapabilities `json:"agentCapabilities"`
}

type agentCapabilities struct {
	SessionCapabilities sessionCapabilities `json:"sessionCapabilities"`
}

type sessionCapabilities struct {
	List any `json:"list"`
}

type listSessionsParams struct {
	Cwd    string `json:"cwd,omitempty"`
	Cursor string `json:"cursor,omitempty"`
}

type pendingResponse struct {
	result json.RawMessage
	err    error
}

func NewClient(command, cwd string, logger *log.Logger) *Client {
	return &Client{
		command: command,
		cwd:     cwd,
		logger:  logger,
	}
}

func (c *Client) ListSessions(ctx context.Context, clientInfo ClientInfo, cursor string) (*SessionListResult, error) {
	session, err := c.start(ctx)
	if err != nil {
		return nil, err
	}
	defer session.close()

	initResult, err := session.initialize(clientInfo)
	if err != nil {
		return nil, err
	}

	if initResult.ProtocolVersion != protocolVersion {
		return nil, fmt.Errorf("acp negotiated unsupported protocol version %d", initResult.ProtocolVersion)
	}

	if initResult.AgentCapabilities.SessionCapabilities.List == nil {
		return nil, errors.New("opencode ACP server does not advertise session/list support")
	}

	var result SessionListResult
	if err := session.call("session/list", listSessionsParams{
		Cwd:    c.cwd,
		Cursor: cursor,
	}, &result); err != nil {
		return nil, err
	}

	if result.Sessions == nil {
		result.Sessions = []SessionInfo{}
	}

	return &result, nil
}

type session struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	pendingMu sync.Mutex
	pending   map[int64]chan pendingResponse
	closed    chan struct{}
	closeOnce sync.Once
	nextID    int64
	logger    *log.Logger
}

func (c *Client) start(ctx context.Context) (*session, error) {
	cmd := exec.CommandContext(ctx, c.command, "acp", "--cwd", c.cwd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create ACP stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create ACP stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("create ACP stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %q ACP server: %w", c.command, err)
	}

	s := &session{
		cmd:     cmd,
		stdin:   stdin,
		pending: make(map[int64]chan pendingResponse),
		closed:  make(chan struct{}),
		logger:  c.logger,
	}

	go s.readStdout(stdout)
	go s.readStderr(stderr)
	go s.wait()

	return s, nil
}

func (s *session) initialize(info ClientInfo) (*initializeResult, error) {
	var result initializeResult
	if err := s.call("initialize", initializeParams{
		ProtocolVersion: protocolVersion,
		ClientInfo:      info,
		ClientCapabilities: clientCapabilities{
			FS: fsCapabilities{
				ReadTextFile:  false,
				WriteTextFile: false,
			},
			Terminal: false,
		},
	}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *session) call(method string, params any, out any) error {
	id := atomic.AddInt64(&s.nextID, 1)
	responseCh := make(chan pendingResponse, 1)

	s.pendingMu.Lock()
	s.pending[id] = responseCh
	s.pendingMu.Unlock()

	request := rpcRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	payload, err := json.Marshal(request)
	if err != nil {
		s.deletePending(id)
		return fmt.Errorf("marshal ACP request %s: %w", method, err)
	}

	if _, err := s.stdin.Write(append(payload, '\n')); err != nil {
		s.deletePending(id)
		return fmt.Errorf("write ACP request %s: %w", method, err)
	}

	response := <-responseCh
	if response.err != nil {
		return fmt.Errorf("ACP %s failed: %w", method, response.err)
	}

	if out == nil {
		return nil
	}

	if len(response.result) == 0 {
		return errors.New("ACP response missing result payload")
	}

	if err := json.Unmarshal(response.result, out); err != nil {
		return fmt.Errorf("decode ACP %s response: %w", method, err)
	}

	return nil
}

func (s *session) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal(line, &envelope); err != nil {
			s.logf("acp: ignoring malformed stdout line: %v", err)
			continue
		}

		rawID, ok := envelope["id"]
		if !ok {
			continue
		}

		var id int64
		if err := json.Unmarshal(rawID, &id); err != nil {
			s.logf("acp: ignoring response with invalid id: %v", err)
			continue
		}

		var response rpcResponse
		if err := json.Unmarshal(line, &response); err != nil {
			s.resolve(id, pendingResponse{err: fmt.Errorf("decode ACP response: %w", err)})
			continue
		}

		if response.Error != nil {
			s.resolve(id, pendingResponse{err: response.Error})
			continue
		}

		s.resolve(id, pendingResponse{result: response.Result})
	}

	if err := scanner.Err(); err != nil {
		s.failAll(fmt.Errorf("read ACP stdout: %w", err))
		return
	}

	s.failAll(io.EOF)
}

func (s *session) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	buf := make([]byte, 0, 16*1024)
	scanner.Buffer(buf, 256*1024)

	for scanner.Scan() {
		s.logf("opencode acp stderr: %s", scanner.Text())
	}
}

func (s *session) wait() {
	if err := s.cmd.Wait(); err != nil {
		s.failAll(fmt.Errorf("opencode ACP process exited: %w", err))
		return
	}

	s.failAll(io.EOF)
}

func (s *session) resolve(id int64, response pendingResponse) {
	s.pendingMu.Lock()
	ch, ok := s.pending[id]
	if ok {
		delete(s.pending, id)
	}
	s.pendingMu.Unlock()

	if ok {
		ch <- response
		close(ch)
	}
}

func (s *session) failAll(err error) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()

	for id, ch := range s.pending {
		delete(s.pending, id)
		ch <- pendingResponse{err: err}
		close(ch)
	}
}

func (s *session) deletePending(id int64) {
	s.pendingMu.Lock()
	delete(s.pending, id)
	s.pendingMu.Unlock()
}

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("code=%d message=%s", e.Code, e.Message)
}

func (s *session) close() {
	s.closeOnce.Do(func() {
		close(s.closed)
		if s.stdin != nil {
			_ = s.stdin.Close()
		}
		if s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
	})
}

func (s *session) logf(format string, args ...any) {
	if s.logger != nil {
		s.logger.Printf(format, args...)
	}
}
