package opencode

import (
	"encoding/json"

	"relaid/internal/providers/acp"
)

type OpenCodeProtocol struct{}

func NewOpenCodeProtocol() *OpenCodeProtocol {
	return &OpenCodeProtocol{}
}

func (p *OpenCodeProtocol) Name() string {
	return "opencode"
}

func (p *OpenCodeProtocol) ListMethod() string {
	return "session/list"
}

func (p *OpenCodeProtocol) NewSessionMethod() string {
	return "session/new"
}

func (p *OpenCodeProtocol) LoadSessionMethod() string {
	return "session/load"
}

func (p *OpenCodeProtocol) PromptMethod() string {
	return "session/prompt"
}

func (p *OpenCodeProtocol) CancelMethod() string {
	return "session/cancel"
}

func (p *OpenCodeProtocol) BuildInitializeParams(info acp.ClientInfo) map[string]any {
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

func (p *OpenCodeProtocol) BuildListParams(cwd, cursor string) map[string]any {
	return map[string]any{
		"cwd":    cwd,
		"cursor": cursor,
	}
}

func (p *OpenCodeProtocol) BuildNewSessionParams(cwd string) map[string]any {
	return map[string]any{
		"cwd":        cwd,
		"mcpServers": []any{},
	}
}

func (p *OpenCodeProtocol) BuildLoadSessionParams(sessionID, cwd string) map[string]any {
	return map[string]any{
		"sessionId":  sessionID,
		"cwd":        cwd,
		"mcpServers": []any{},
	}
}

func (p *OpenCodeProtocol) BuildPromptParams(sessionID, prompt string) map[string]any {
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

func (p *OpenCodeProtocol) BuildCancelParams(sessionID string) map[string]any {
	return map[string]any{
		"sessionId": sessionID,
	}
}

func (p *OpenCodeProtocol) ParseSessionList(raw json.RawMessage) (*acp.SessionListResult, error) {
	var result acp.SessionListResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenCodeProtocol) ParseSessionCreate(raw json.RawMessage) (*acp.SessionCreateResult, error) {
	var result acp.SessionCreateResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenCodeProtocol) ParseSessionLoad(raw json.RawMessage) (*acp.SessionLoadResult, error) {
	var result acp.SessionLoadResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenCodeProtocol) ParsePrompt(raw json.RawMessage) (*acp.PromptResult, error) {
	var result acp.PromptResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenCodeProtocol) HandleNotification(rawMethod json.RawMessage, rawParams json.RawMessage, handler func(acp.SessionUpdate)) {
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
