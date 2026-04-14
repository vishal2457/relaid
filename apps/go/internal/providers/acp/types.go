package acp

import (
	"encoding/json"
)

const ProtocolVersion = 1

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

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}
