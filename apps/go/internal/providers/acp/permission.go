package acp

import (
	"context"
	"encoding/json"
	"strings"
)

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Kind     string `json:"kind"`
	Name     string `json:"name,omitempty"`
}

type ToolCallLocation struct {
	Path string `json:"path"`
}

type ToolCallUpdate struct {
	ToolCallID string             `json:"toolCallId,omitempty"`
	Title      string             `json:"title,omitempty"`
	Kind       string             `json:"kind,omitempty"`
	Locations  []ToolCallLocation `json:"locations,omitempty"`
}

type ACPPermissionRequest struct {
	SessionID string
	Method    string
	Options   []PermissionOption
	ToolCall  *ToolCallUpdate
	RawParams json.RawMessage
}

type ACPPermissionResponse struct {
	Outcome  string `json:"outcome"`
	OptionID string `json:"optionId,omitempty"`
}

type ACPQuestionOption struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

type ACPQuestion struct {
	Question string              `json:"question"`
	Header   string              `json:"header"`
	Options  []ACPQuestionOption `json:"options"`
	Multiple bool                `json:"multiple,omitempty"`
	Custom   bool                `json:"custom,omitempty"`
}

type ACPQuestionRequest struct {
	SessionID string
	Method    string
	Questions []ACPQuestion
	RawParams json.RawMessage
}

type ACPQuestionResponse struct {
	Answers [][]string `json:"answers"`
}

type InteractionHandler interface {
	HandlePermission(ctx context.Context, req ACPPermissionRequest) (ACPPermissionResponse, error)
	HandleQuestion(ctx context.Context, req ACPQuestionRequest) (ACPQuestionResponse, error)
}

type DenyHandler struct{}

func (h *DenyHandler) HandlePermission(_ context.Context, req ACPPermissionRequest) (ACPPermissionResponse, error) {
	for _, option := range req.Options {
		if strings.HasPrefix(option.Kind, "reject") {
			return ACPPermissionResponse{
				Outcome:  "selected",
				OptionID: option.OptionID,
			}, nil
		}
	}
	if len(req.Options) > 0 {
		last := req.Options[len(req.Options)-1]
		if strings.HasPrefix(last.Kind, "reject") || strings.HasPrefix(last.Kind, "deny") {
			return ACPPermissionResponse{
				Outcome:  "selected",
				OptionID: last.OptionID,
			}, nil
		}
	}
	return ACPPermissionResponse{Outcome: "cancelled"}, nil
}

func (h *DenyHandler) HandleQuestion(_ context.Context, _ ACPQuestionRequest) (ACPQuestionResponse, error) {
	return ACPQuestionResponse{}, nil
}
