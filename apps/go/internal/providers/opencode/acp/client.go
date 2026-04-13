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
	"strings"
	"sync"
	"sync/atomic"
)

const protocolVersion = 1

type Client struct {
	command string
	cwd     string
	logger  *log.Logger
}

type Connection struct {
	cmd                 *exec.Cmd
	cwd                 string
	stdin               io.WriteCloser
	pendingMu           sync.Mutex
	pending             map[int64]chan responseEnvelope
	nextID              int64
	logger              *log.Logger
	capabilities        AgentCapabilities
	configOptions       []ConfigOption
	serverRequestMu     sync.Mutex
	serverRequestActive map[int64]struct{}
}

type ClientInfo struct {
	Name    string `json:"name,omitempty"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version,omitempty"`
}

type AgentCapabilities struct {
	LoadSession         bool `json:"loadSession"`
	SessionCapabilities struct {
		List any `json:"list"`
	} `json:"sessionCapabilities"`
}

type ConfigOption struct {
	ID           string `json:"id"`
	CurrentValue any    `json:"currentValue,omitempty"`
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

type SessionCreateResult struct {
	SessionID     string         `json:"sessionId"`
	ConfigOptions []ConfigOption `json:"configOptions"`
}

type SessionLoadResult struct {
	SessionID     string         `json:"sessionId"`
	ConfigOptions []ConfigOption `json:"configOptions"`
}

type PromptResult struct {
	StopReason string `json:"stopReason"`
}

type SessionUpdate struct {
	SessionID  string
	Update     string
	MessageID  string
	Text       string
	Status     string
	ToolCallID string
}

type responseEnvelope struct {
	result json.RawMessage
	err    error
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

func NewClient(command, cwd string, logger *log.Logger) *Client {
	return &Client{command: command, cwd: cwd, logger: logger}
}

func (c *Client) Start(ctx context.Context, info ClientInfo, updateHandler func(SessionUpdate)) (*Connection, error) {
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
		return nil, fmt.Errorf("start ACP server: %w", err)
	}

	conn := &Connection{
		cmd:                 cmd,
		cwd:                 c.cwd,
		stdin:               stdin,
		pending:             make(map[int64]chan responseEnvelope),
		logger:              c.logger,
		serverRequestActive: make(map[int64]struct{}),
	}

	go conn.readStdout(stdout, updateHandler)
	go conn.readStderr(stderr)
	go conn.wait()

	var initResult struct {
		ProtocolVersion   int               `json:"protocolVersion"`
		AgentCapabilities AgentCapabilities `json:"agentCapabilities"`
	}

	if err := conn.call("initialize", map[string]any{
		"protocolVersion": protocolVersion,
		"clientInfo":      info,
		"clientCapabilities": map[string]any{
			"fs": map[string]bool{
				"readTextFile":  false,
				"writeTextFile": false,
			},
			"terminal": false,
		},
	}, &initResult); err != nil {
		conn.Close()
		return nil, err
	}

	if initResult.ProtocolVersion != protocolVersion {
		conn.Close()
		return nil, fmt.Errorf("unsupported ACP protocol version %d", initResult.ProtocolVersion)
	}

	conn.capabilities = initResult.AgentCapabilities
	return conn, nil
}

func (c *Client) ListSessions(ctx context.Context, info ClientInfo, cwd string, cursor string) (*SessionListResult, error) {
	conn, err := c.Start(ctx, info, nil)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	if conn.capabilities.SessionCapabilities.List == nil {
		return nil, errors.New("ACP session/list is not supported")
	}

	effectiveCwd := cwd
	if effectiveCwd == "" {
		effectiveCwd = c.cwd
	}

	var raw json.RawMessage
	if err := conn.call("session/list", map[string]any{
		"cwd":    effectiveCwd,
		"cursor": cursor,
	}, &raw); err != nil {
		return nil, err
	}

	var result SessionListResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode session/list response: %w", err)
	}
	if result.Sessions == nil {
		result.Sessions = []SessionInfo{}
	}
	return &result, nil
}

func (c *Connection) NewSession(ctx context.Context, cwd string) (*SessionCreateResult, error) {
	var result SessionCreateResult
	if err := c.call("session/new", map[string]any{
		"cwd":        cwd,
		"mcpServers": []any{},
	}, &result); err != nil {
		return nil, err
	}
	c.configOptions = result.ConfigOptions
	for _, opt := range c.configOptions {
		c.logf("ACP new session config: id=%q currentValue=%v", opt.ID, opt.CurrentValue)
	}
	return &result, nil
}

func (c *Connection) LoadSession(ctx context.Context, sessionID, cwd string) (*SessionLoadResult, error) {
	var result SessionLoadResult
	if err := c.call("session/load", map[string]any{
		"sessionId":  sessionID,
		"cwd":        cwd,
		"mcpServers": []any{},
	}, &result); err != nil {
		return nil, err
	}
	c.configOptions = result.ConfigOptions
	for _, opt := range c.configOptions {
		c.logf("ACP load session config: id=%q currentValue=%v", opt.ID, opt.CurrentValue)
	}
	return &result, nil
}

func (c *Connection) Prompt(ctx context.Context, sessionID string, prompt string, modelID string) (*PromptResult, error) {
	params := map[string]any{
		"sessionId": sessionID,
		"prompt": []map[string]any{
			{
				"type": "text",
				"text": prompt,
			},
		},
	}

	if modelID != "" {
		params["model"] = map[string]any{
			"modelID":    modelID,
			"providerID": "",
		}
		if strings.Contains(modelID, "/") {
			parts := strings.SplitN(modelID, "/", 2)
			params["model"] = map[string]any{
				"modelID":    parts[1],
				"providerID": parts[0],
			}
		}
		c.logf("ACP prompt: setting model=%v", params["model"])
	}

	if len(c.configOptions) > 0 {
		overridden := withModelOverride(c.configOptions, modelID)
		for _, opt := range overridden {
			if isModelConfigOption(opt["id"].(string)) {
				c.logf("ACP prompt: config id=%q value=%v", opt["id"], opt["currentValue"])
			}
		}
		params["configOptions"] = overridden
	} else if modelID != "" {
		c.logf("ACP prompt: modelID=%q but configOptions is empty, model override NOT applied", modelID)
	}

	var result PromptResult
	if err := c.call("session/prompt", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Connection) Cancel(sessionID string) error {
	return c.notify("session/cancel", map[string]any{
		"sessionId": sessionID,
	})
}

func (c *Connection) Capabilities() AgentCapabilities {
	return c.capabilities
}

func (c *Connection) Close() {
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
}

func (c *Connection) call(method string, params any, out any) error {
	id := atomic.AddInt64(&c.nextID, 1)
	responseCh := make(chan responseEnvelope, 1)

	c.pendingMu.Lock()
	c.pending[id] = responseCh
	c.pendingMu.Unlock()

	request := rpcRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	payload, err := json.Marshal(request)
	if err != nil {
		c.deletePending(id)
		return err
	}

	if _, err := c.stdin.Write(append(payload, '\n')); err != nil {
		c.deletePending(id)
		return err
	}

	response := <-responseCh
	if response.err != nil {
		return response.err
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(response.result, out)
}

func (c *Connection) notify(method string, params any) error {
	payload, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return err
	}
	_, err = c.stdin.Write(append(payload, '\n'))
	return err
}

func (c *Connection) readStdout(stdout io.Reader, updateHandler func(SessionUpdate)) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			c.logf("ACP malformed stdout: %v", err)
			continue
		}

		rawMethod, hasMethod := raw["method"]
		rawID, hasID := raw["id"]

		if hasMethod && hasID {
			c.handleServerRequest(rawID, rawMethod, raw["params"])
			continue
		}

		if hasMethod {
			c.handleNotification(rawMethod, raw["params"], updateHandler)
			continue
		}

		if hasID {
			var response rpcResponse
			if err := json.Unmarshal(line, &response); err != nil {
				continue
			}
			if response.Error != nil {
				c.resolve(response.ID, responseEnvelope{err: response.Error})
				continue
			}
			c.resolve(response.ID, responseEnvelope{result: response.Result})
		}
	}

	if err := scanner.Err(); err != nil {
		c.failAll(err)
		return
	}
	c.failAll(io.EOF)
}

func (c *Connection) handleNotification(rawMethod json.RawMessage, rawParams json.RawMessage, updateHandler func(SessionUpdate)) {
	if updateHandler == nil {
		return
	}

	var method string
	if err := json.Unmarshal(rawMethod, &method); err != nil {
		return
	}
	if method != "session/update" {
		return
	}

	var envelope struct {
		SessionID string `json:"sessionId"`
		Update    struct {
			SessionUpdate string `json:"sessionUpdate"`
			MessageID     string `json:"messageId"`
			Status        string `json:"status"`
			ToolCallID    string `json:"toolCallId"`
			Content       struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"update"`
	}

	if err := json.Unmarshal(rawParams, &envelope); err != nil {
		return
	}

	updateHandler(SessionUpdate{
		SessionID:  envelope.SessionID,
		Update:     envelope.Update.SessionUpdate,
		MessageID:  envelope.Update.MessageID,
		Text:       envelope.Update.Content.Text,
		Status:     envelope.Update.Status,
		ToolCallID: envelope.Update.ToolCallID,
	})
}

func (c *Connection) handleServerRequest(rawID json.RawMessage, rawMethod json.RawMessage, rawParams json.RawMessage) {
	var id int64
	if err := json.Unmarshal(rawID, &id); err != nil {
		return
	}

	var method string
	if err := json.Unmarshal(rawMethod, &method); err != nil {
		return
	}

	var result any
	var errResp *rpcError

	switch method {
	case "session/request_permission":
		result, errResp = autoApprovePermission(rawParams)
	default:
		errResp = &rpcError{
			Code:    -32601,
			Message: "method not supported by client",
		}
	}

	response := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
	}
	if errResp != nil {
		response["error"] = errResp
	} else {
		response["result"] = result
	}

	payload, err := json.Marshal(response)
	if err != nil {
		return
	}
	_, _ = c.stdin.Write(append(payload, '\n'))
}

func autoApprovePermission(rawParams json.RawMessage) (map[string]any, *rpcError) {
	var request struct {
		Options []struct {
			OptionID string `json:"optionId"`
			Kind     string `json:"kind"`
		} `json:"options"`
	}
	if err := json.Unmarshal(rawParams, &request); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid permission request"}
	}

	for _, option := range request.Options {
		if strings.HasPrefix(option.Kind, "allow") {
			return map[string]any{
				"outcome": map[string]any{
					"outcome":  "selected",
					"optionId": option.OptionID,
				},
			}, nil
		}
	}

	if len(request.Options) == 0 {
		return map[string]any{
			"outcome": map[string]any{
				"outcome": "cancelled",
			},
		}, nil
	}

	return map[string]any{
		"outcome": map[string]any{
			"outcome":  "selected",
			"optionId": request.Options[0].OptionID,
		},
	}, nil
}

func (c *Connection) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() {
		c.logf("opencode acp stderr: %s", scanner.Text())
	}
}

func (c *Connection) wait() {
	if c.cmd == nil {
		return
	}
	if err := c.cmd.Wait(); err != nil {
		c.failAll(err)
	}
}

func (c *Connection) resolve(id int64, response responseEnvelope) {
	c.pendingMu.Lock()
	ch, ok := c.pending[id]
	if ok {
		delete(c.pending, id)
	}
	c.pendingMu.Unlock()
	if ok {
		ch <- response
		close(ch)
	}
}

func (c *Connection) failAll(err error) {
	c.pendingMu.Lock()
	defer c.pendingMu.Unlock()
	for id, ch := range c.pending {
		delete(c.pending, id)
		ch <- responseEnvelope{err: err}
		close(ch)
	}
}

func (c *Connection) deletePending(id int64) {
	c.pendingMu.Lock()
	delete(c.pending, id)
	c.pendingMu.Unlock()
}

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("code=%d message=%s", e.Code, e.Message)
}

func (c *Connection) logf(format string, args ...any) {
	if c.logger != nil {
		c.logger.Printf(format, args...)
	}
}

func withModelOverride(options []ConfigOption, modelID string) []map[string]any {
	result := make([]map[string]any, 0, len(options))
	for _, option := range options {
		current := option.CurrentValue
		if modelID != "" && isModelConfigOption(option.ID) {
			if !strings.Contains(modelID, "/") {
				if s, ok := current.(string); ok && strings.Contains(s, "/") {
					prefix := s[:strings.LastIndex(s, "/")+1]
					current = prefix + modelID
				} else {
					current = modelID
				}
			} else {
				current = modelID
			}
		}
		result = append(result, map[string]any{
			"id":           option.ID,
			"currentValue": current,
		})
	}
	return result
}

func isModelConfigOption(id string) bool {
	switch id {
	case "model", "model_id", "modelId":
		return true
	}
	return false
}
