package acp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
)

type Protocol interface {
	Name() string

	ListMethod() string
	NewSessionMethod() string
	LoadSessionMethod() string
	PromptMethod() string
	CancelMethod() string

	BuildInitializeParams(info ClientInfo) map[string]any
	BuildListParams(cwd, cursor string) map[string]any
	BuildNewSessionParams(cwd string) map[string]any
	BuildLoadSessionParams(sessionID, cwd string) map[string]any
	BuildPromptParams(sessionID, prompt string) map[string]any
	BuildCancelParams(sessionID string) map[string]any

	ParseSessionList(raw json.RawMessage) (*SessionListResult, error)
	ParseSessionCreate(raw json.RawMessage) (*SessionCreateResult, error)
	ParseSessionLoad(raw json.RawMessage) (*SessionLoadResult, error)
	ParsePrompt(raw json.RawMessage) (*PromptResult, error)

	HandleNotification(rawMethod json.RawMessage, rawParams json.RawMessage, handler func(SessionUpdate))
}

type Client struct {
	command string
	cwd     string
	logger  *log.Logger
}

type Connection struct {
	cmd                 *exec.Cmd
	stdin               io.WriteCloser
	pendingMu           sync.Mutex
	pending             map[int64]chan responseEnvelope
	nextID              int64
	logger              *log.Logger
	protocol            Protocol
	configOptions       []ConfigOption
	serverReqMu         sync.Mutex
	serverRequestActive map[int64]struct{}
}

func NewClient(command, cwd string, logger *log.Logger) *Client {
	return &Client{command: command, cwd: cwd, logger: logger}
}

func (c *Client) Start(ctx context.Context, info ClientInfo, protocol Protocol, updateHandler func(SessionUpdate)) (*Connection, error) {
	cmd := exec.CommandContext(ctx, c.command, append([]string{}, c.commandArgs(protocol)...)...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start ACP server: %w", err)
	}

	conn := &Connection{
		cmd:                 cmd,
		stdin:               stdin,
		pending:             make(map[int64]chan responseEnvelope),
		logger:              c.logger,
		protocol:            protocol,
		serverRequestActive: make(map[int64]struct{}),
	}

	go conn.readStdout(stdout, updateHandler)
	go conn.readStderr(stderr)
	go conn.wait()

	var initResult struct {
		ProtocolVersion   int               `json:"protocolVersion"`
		AgentCapabilities AgentCapabilities `json:"agentCapabilities"`
	}

	if err := conn.call("initialize", protocol.BuildInitializeParams(info), &initResult); err != nil {
		conn.Close()
		return nil, err
	}

	if initResult.ProtocolVersion != ProtocolVersion {
		conn.Close()
		return nil, fmt.Errorf("unsupported ACP protocol version %d", initResult.ProtocolVersion)
	}

	return conn, nil
}

func (c *Client) commandArgs(protocol Protocol) []string {
	switch protocol.Name() {
	case "codex":
		return []string{"app-server"}
	case "opencode":
		return []string{"acp", "--cwd", c.cwd}
	default:
		return []string{"acp"}
	}
}

func (c *Connection) ListSessions(ctx context.Context, cwd, cursor string) (*SessionListResult, error) {
	params := c.protocol.BuildListParams(cwd, cursor)

	var raw json.RawMessage
	if err := c.call(c.protocol.ListMethod(), params, &raw); err != nil {
		return nil, err
	}

	result, err := c.protocol.ParseSessionList(raw)
	if err != nil {
		return nil, err
	}
	if result.Sessions == nil {
		result.Sessions = []SessionInfo{}
	}
	return result, nil
}

func (c *Connection) NewSession(ctx context.Context, cwd string) (*SessionCreateResult, error) {
	params := c.protocol.BuildNewSessionParams(cwd)

	var result SessionCreateResult
	if err := c.call(c.protocol.NewSessionMethod(), params, &result); err != nil {
		return nil, err
	}

	c.configOptions = result.ConfigOptions
	c.logf("ACP new session config: %+v", result.ConfigOptions)
	return &result, nil
}

func (c *Connection) LoadSession(ctx context.Context, sessionID, cwd string) (*SessionLoadResult, error) {
	params := c.protocol.BuildLoadSessionParams(sessionID, cwd)

	var result SessionLoadResult
	if err := c.call(c.protocol.LoadSessionMethod(), params, &result); err != nil {
		return nil, err
	}

	c.configOptions = result.ConfigOptions
	c.logf("ACP load session config: %+v", result.ConfigOptions)
	return &result, nil
}

func (c *Connection) SetConfigOption(sessionID, configID, value string) error {
	var result struct {
		ConfigOptions []ConfigOption `json:"configOptions"`
	}
	if err := c.call("session/set_config_option", map[string]any{
		"sessionId": sessionID,
		"configId":  configID,
		"value":     value,
	}, &result); err != nil {
		return err
	}
	c.configOptions = result.ConfigOptions
	return nil
}

func (c *Connection) Prompt(ctx context.Context, sessionID, prompt, modelID string) (*PromptResult, error) {
	if modelID != "" {
		for _, opt := range c.configOptions {
			if isModelConfigOption(opt.ID) {
				targetValue := resolveModelValue(opt, modelID)
				if err := c.SetConfigOption(sessionID, opt.ID, targetValue); err != nil {
					c.logf("ACP: failed to set model config option: %v", err)
				}
				break
			}
		}
	}

	params := c.protocol.BuildPromptParams(sessionID, prompt)

	var result PromptResult
	if err := c.call(c.protocol.PromptMethod(), params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Connection) Cancel(ctx context.Context, sessionID string) error {
	return c.notify(c.protocol.CancelMethod(), map[string]any{
		"sessionId": sessionID,
	})
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
	var method string
	if err := json.Unmarshal(rawMethod, &method); err != nil {
		return
	}

	switch method {
	case "session/update":
		if updateHandler == nil {
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

	case "config_option_update":
		var update struct {
			ConfigOptions []ConfigOption `json:"configOptions"`
		}
		if err := json.Unmarshal(rawParams, &update); err == nil {
			c.configOptions = update.ConfigOptions
		}
	}
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
	case "session/request_permission", "agent/request_permission":
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
		c.logf("ACP stderr: %s", scanner.Text())
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

func (c *Connection) logf(format string, args ...any) {
	if c.logger != nil {
		c.logger.Printf(format, args...)
	}
}

func isModelConfigOption(id string) bool {
	switch id {
	case "model", "model_id", "modelId":
		return true
	}
	return false
}

func resolveModelValue(opt ConfigOption, modelID string) string {
	if strings.Contains(modelID, "/") {
		return modelID
	}
	if s, ok := opt.CurrentValue.(string); ok && strings.Contains(s, "/") {
		prefix := s[:strings.LastIndex(s, "/")+1]
		return prefix + modelID
	}
	return modelID
}
