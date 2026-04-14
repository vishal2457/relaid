package codex

import (
	"encoding/json"

	"relaid/internal/providers/acp"
)

type CodexProtocol struct{}

func NewCodexProtocol() *CodexProtocol {
	return &CodexProtocol{}
}

func (p *CodexProtocol) Name() string {
	return "codex"
}

func (p *CodexProtocol) ListMethod() string {
	return "session/list"
}

func (p *CodexProtocol) NewSessionMethod() string {
	return "session/new"
}

func (p *CodexProtocol) LoadSessionMethod() string {
	return "session/load"
}

func (p *CodexProtocol) PromptMethod() string {
	return "session/prompt"
}

func (p *CodexProtocol) CancelMethod() string {
	return "session/cancel"
}

func (p *CodexProtocol) BuildInitializeParams(info acp.ClientInfo) map[string]any {
	return map[string]any{
		"protocolVersion": acp.ProtocolVersion,
		"clientInfo":      info,
		"clientCapabilities": map[string]any{
			"fs": map[string]bool{
				"readTextFile":  false,
				"writeTextFile": false,
			},
			"terminal": false,
		},
	}
}

func (p *CodexProtocol) BuildListParams(cwd, cursor string) map[string]any {
	return map[string]any{
		"cwd":    cwd,
		"cursor": cursor,
	}
}

func (p *CodexProtocol) BuildNewSessionParams(cwd string) map[string]any {
	return map[string]any{
		"cwd":        cwd,
		"mcpServers": []any{},
	}
}

func (p *CodexProtocol) BuildLoadSessionParams(sessionID, cwd string) map[string]any {
	return map[string]any{
		"sessionId":  sessionID,
		"cwd":        cwd,
		"mcpServers": []any{},
	}
}

func (p *CodexProtocol) BuildPromptParams(sessionID, prompt string) map[string]any {
	return map[string]any{
		"sessionId": sessionID,
		"prompt": []map[string]any{
			{
				"type": "text",
				"text": prompt,
			},
		},
	}
}

func (p *CodexProtocol) BuildCancelParams(sessionID string) map[string]any {
	return map[string]any{
		"sessionId": sessionID,
	}
}

type threadListResponse struct {
	Data       []threadInfo `json:"data"`
	NextCursor *string      `json:"nextCursor"`
}

type threadInfo struct {
	ID            string `json:"id"`
	Name          string `json:"name,omitempty"`
	Preview       string `json:"preview,omitempty"`
	Ephemeral     bool   `json:"ephemeral"`
	ModelProvider string `json:"modelProvider,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt,omitempty"`
	Status        struct {
		Type string `json:"type"`
	} `json:"status"`
}

func (p *CodexProtocol) ParseSessionList(raw json.RawMessage) (*acp.SessionListResult, error) {
	var result acp.SessionListResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	if result.Sessions == nil {
		result.Sessions = []acp.SessionInfo{}
	}
	return &result, nil
}

func (p *CodexProtocol) ParseSessionCreate(raw json.RawMessage) (*acp.SessionCreateResult, error) {
	var result acp.SessionCreateResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *CodexProtocol) ParseSessionLoad(raw json.RawMessage) (*acp.SessionLoadResult, error) {
	var result acp.SessionLoadResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *CodexProtocol) ParsePrompt(raw json.RawMessage) (*acp.PromptResult, error) {
	var result acp.PromptResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *CodexProtocol) HandleNotification(rawMethod json.RawMessage, rawParams json.RawMessage, handler func(acp.SessionUpdate)) {
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

	handler(acp.SessionUpdate{
		SessionID:  envelope.SessionID,
		Update:     envelope.Update.SessionUpdate,
		MessageID:  envelope.Update.MessageID,
		Text:       envelope.Update.Content.Text,
		Status:     envelope.Update.Status,
		ToolCallID: envelope.Update.ToolCallID,
	})
}
