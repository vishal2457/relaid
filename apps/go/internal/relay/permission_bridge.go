package relay

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"relaid/internal/providers/acp"
)

type RelayPermissionBridge struct {
	handler         *Handler
	logger          *log.Logger
	agentProviderID string
}

func NewRelayPermissionBridge(handler *Handler, agentProviderID ...string) *RelayPermissionBridge {
	providerID := ""
	if len(agentProviderID) > 0 {
		providerID = agentProviderID[0]
	}
	return &RelayPermissionBridge{
		handler:         handler,
		logger:          log.Default(),
		agentProviderID: providerID,
	}
}

func (b *RelayPermissionBridge) HandlePermission(ctx context.Context, req acp.ACPPermissionRequest) (acp.ACPPermissionResponse, error) {
	requestID := fmt.Sprintf("perm_%s_%d", req.SessionID, time.Now().UnixMilli())

	permission := mapPermissionKind(req)
	patterns := extractPatterns(req)

	metadata := map[string]interface{}{
		"source":    "desktop",
		"sessionId": req.SessionID,
	}
	if req.ToolCall != nil {
		metadata["title"] = req.ToolCall.Title
		metadata["toolKind"] = req.ToolCall.Kind
		metadata["toolCallId"] = req.ToolCall.ToolCallID
	}

	payload := PermissionRequestPayload{
		RequestID:       requestID,
		AgentProviderID: b.agentProviderID,
		ProjectID:       "",
		SessionID:       req.SessionID,
		JobID:           fmt.Sprintf("desktop_%d", time.Now().UnixMilli()),
		ThreadID:        "",
		Permission:      permission,
		Patterns:        patterns,
		Metadata:        metadata,
	}

	reply, err := b.handler.RequestPermission(payload)
	if err != nil {
		b.logger.Printf("relay: permission bridge error: %v, denying", err)
		return b.denyPermission(req), nil
	}

	return b.mapPermissionReply(reply, req), nil
}

func (b *RelayPermissionBridge) HandleQuestion(ctx context.Context, req acp.ACPQuestionRequest) (acp.ACPQuestionResponse, error) {
	requestID := fmt.Sprintf("q_%d", time.Now().UnixMilli())

	questions := make([]Question, 0, len(req.Questions))
	for _, q := range req.Questions {
		options := make([]QuestionOption, 0, len(q.Options))
		for _, o := range q.Options {
			options = append(options, QuestionOption{
				Label:       o.Label,
				Description: o.Description,
			})
		}
		questions = append(questions, Question{
			Header:   q.Header,
			Question: q.Question,
			Options:  options,
			Multiple: q.Multiple,
			Custom:   q.Custom,
		})
	}

	payload := QuestionRequestPayload{
		RequestID:       requestID,
		AgentProviderID: b.agentProviderID,
		ProjectID:       "",
		SessionID:       req.SessionID,
		JobID:           fmt.Sprintf("desktop_%d", time.Now().UnixMilli()),
		ThreadID:        "",
		Questions:       questions,
	}

	answers, err := b.handler.RequestQuestion(payload)
	if err != nil {
		b.logger.Printf("relay: question bridge error: %v, returning empty answers", err)
		return acp.ACPQuestionResponse{}, nil
	}

	if len(answers) < len(req.Questions) {
		padded := make([][]string, len(req.Questions))
		copy(padded, answers)
		answers = padded
	}

	return acp.ACPQuestionResponse{Answers: answers}, nil
}

func mapPermissionKind(req acp.ACPPermissionRequest) string {
	if req.ToolCall != nil && req.ToolCall.Kind != "" {
		switch req.ToolCall.Kind {
		case "read":
			return "read"
		case "edit":
			return "edit"
		case "delete":
			return "edit"
		case "move":
			return "edit"
		case "execute":
			return "bash"
		case "fetch":
			return "webfetch"
		case "search":
			return "glob"
		case "think":
			return "bash"
		default:
			return req.ToolCall.Kind
		}
	}

	for _, opt := range req.Options {
		name := strings.ToLower(opt.Name)
		if strings.Contains(name, "command") || strings.Contains(name, "bash") || strings.Contains(name, "execute") || strings.Contains(name, "run") {
			return "bash"
		}
	}

	return "edit"
}

func extractPatterns(req acp.ACPPermissionRequest) []string {
	if req.ToolCall != nil && len(req.ToolCall.Locations) > 0 {
		patterns := make([]string, 0, len(req.ToolCall.Locations))
		for _, loc := range req.ToolCall.Locations {
			if loc.Path != "" {
				patterns = append(patterns, loc.Path)
			}
		}
		if len(patterns) > 0 {
			return patterns
		}
	}

	if req.ToolCall != nil && req.ToolCall.Title != "" {
		return []string{req.ToolCall.Title}
	}

	return []string{"*"}
}

func (b *RelayPermissionBridge) denyPermission(req acp.ACPPermissionRequest) acp.ACPPermissionResponse {
	for _, option := range req.Options {
		if strings.HasPrefix(option.Kind, "reject") {
			return acp.ACPPermissionResponse{
				Outcome:  "selected",
				OptionID: option.OptionID,
			}
		}
	}
	if len(req.Options) > 0 {
		last := req.Options[len(req.Options)-1]
		if strings.HasPrefix(last.Kind, "reject") || strings.HasPrefix(last.Kind, "deny") {
			return acp.ACPPermissionResponse{
				Outcome:  "selected",
				OptionID: last.OptionID,
			}
		}
	}
	return acp.ACPPermissionResponse{Outcome: "cancelled"}
}

func (b *RelayPermissionBridge) mapPermissionReply(reply string, req acp.ACPPermissionRequest) acp.ACPPermissionResponse {
	switch reply {
	case "always":
		for _, option := range req.Options {
			if option.Kind == "allow_always" {
				return acp.ACPPermissionResponse{Outcome: "selected", OptionID: option.OptionID}
			}
		}
		for _, option := range req.Options {
			if strings.HasPrefix(option.Kind, "allow") {
				return acp.ACPPermissionResponse{Outcome: "selected", OptionID: option.OptionID}
			}
		}

	case "once":
		for _, option := range req.Options {
			if option.Kind == "allow_once" {
				return acp.ACPPermissionResponse{Outcome: "selected", OptionID: option.OptionID}
			}
		}
		for _, option := range req.Options {
			if strings.HasPrefix(option.Kind, "allow") && option.Kind != "allow_always" {
				return acp.ACPPermissionResponse{Outcome: "selected", OptionID: option.OptionID}
			}
		}
		for _, option := range req.Options {
			if strings.HasPrefix(option.Kind, "allow") {
				return acp.ACPPermissionResponse{Outcome: "selected", OptionID: option.OptionID}
			}
		}

	case "reject":
		return b.denyPermission(req)
	}

	return b.denyPermission(req)
}
