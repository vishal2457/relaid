package codex

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/config"
	"relaid/internal/providers/acp"
)

type Provider struct {
	id           agent.ProviderID
	capabilities agent.CapabilitySet
	sessions     *sessionService
}

func New(cfg config.Config, logger *log.Logger) *Provider {
	acpClient := acp.NewClient(cfg.CodexBin, cfg.CodexCwd, logger)
	protocol := NewCodexProtocol()
	activeRuns := &activeRunStore{runs: map[string]context.CancelFunc{}}

	return &Provider{
		id: agent.ProviderCodex,
		capabilities: agent.CapabilitySet{
			ProjectsList:   false,
			ProjectsGet:    false,
			SessionsList:   true,
			SessionsGet:    true,
			SessionsMsgs:   false,
			SessionsDiff:   false,
			SessionsAbort:  true,
			SessionsRun:    true,
			SessionsStream: true,
			ProvidersList:  true,
			AgentsList:     false,
		},
		sessions: &sessionService{
			cfg:       cfg,
			logger:    logger,
			acpClient: acpClient,
			protocol:  protocol,
			active:    activeRuns,
			clientInfo: acp.ClientInfo{
				Name:    "relaid-go",
				Title:   "Relaid Go Server",
				Version: "0.0.1",
			},
		},
	}
}

func (p *Provider) ID() agent.ProviderID {
	return p.id
}

func (p *Provider) Capabilities() agent.CapabilitySet {
	return p.capabilities
}

func (p *Provider) Projects() agent.ProjectService {
	return nil
}

func (p *Provider) Sessions() agent.SessionService {
	return p.sessions
}

func (p *Provider) Providers() agent.ProviderService {
	return nil
}

func (p *Provider) Agents() agent.AgentService {
	return nil
}

func (p *Provider) Shutdown(context.Context) error {
	return nil
}

type sessionService struct {
	cfg        config.Config
	logger     *log.Logger
	acpClient  *acp.Client
	protocol   *CodexProtocol
	active     *activeRunStore
	clientInfo acp.ClientInfo
}

type activeRunStore struct {
	mu   sync.Mutex
	runs map[string]context.CancelFunc
}

func (s *sessionService) List(ctx context.Context, filters agent.SessionFilters) ([]agent.Session, string, error) {
	if filters.Cwd != "" {
		// Cwd filtering is handled by the protocol
	}

	conn, err := s.acpClient.Start(ctx, s.clientInfo, s.protocol, nil)
	if err != nil {
		return nil, "", err
	}
	defer conn.Close()

	result, err := conn.ListSessions(ctx, filters.Cwd, filters.Cursor)
	if err != nil {
		return nil, "", err
	}

	sessions := make([]agent.Session, 0, len(result.Sessions))
	for _, info := range result.Sessions {
		session := agent.Session{
			ID:        info.SessionID,
			Directory: info.Cwd,
			Title:     info.Title,
			Status:    agent.SessionCompleted,
			CreatedAt: parseTime(info.UpdatedAt),
			UpdatedAt: parseTime(info.UpdatedAt),
		}
		if s.active.Has(session.ID) {
			session.Status = agent.SessionRunning
		}
		sessions = append(sessions, session)
	}

	filtered := make([]agent.Session, 0, len(sessions))
	for _, session := range sessions {
		if filters.Status != "" && string(session.Status) != filters.Status {
			continue
		}
		filtered = append(filtered, session)
	}

	if filters.Limit > 0 && len(filtered) > filters.Limit {
		filtered = filtered[:filters.Limit]
	}
	return filtered, result.NextCursor, nil
}

func (s *sessionService) Get(ctx context.Context, id string) (*agent.Session, error) {
	conn, err := s.acpClient.Start(ctx, s.clientInfo, s.protocol, nil)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// For Codex, we need to use thread/read to get session details
	// This is not yet implemented in the protocol, so return minimal info
	session := &agent.Session{
		ID:     id,
		Status: agent.SessionCompleted,
	}
	if s.active.Has(id) {
		session.Status = agent.SessionRunning
	}
	return session, nil
}

func (s *sessionService) Create(ctx context.Context, projectID string) (*agent.Session, error) {
	conn, err := s.acpClient.Start(ctx, s.clientInfo, s.protocol, nil)
	if err != nil {
		return nil, fmt.Errorf("start acp connection: %w", err)
	}
	defer conn.Close()

	result, err := conn.NewSession(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	now := time.Now().UTC()
	return &agent.Session{
		ID:        result.SessionID,
		ProjectID: projectID,
		Directory: "",
		Status:    agent.SessionCompleted,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *sessionService) Messages(ctx context.Context, id string, limit int) ([]agent.SessionMessagesResponse, error) {
	return nil, fmt.Errorf("not implemented: Codex does not support message retrieval via ACP")
}

func (s *sessionService) Diff(ctx context.Context, id string, messageID string) ([]agent.FileDiff, error) {
	return nil, fmt.Errorf("not implemented: Codex does not support diff retrieval via ACP")
}

func (s *sessionService) Run(ctx context.Context, input agent.RunInput) (*agent.RunResult, error) {
	var output strings.Builder
	result, err := s.RunStream(ctx, input, func(chunk agent.StreamChunk) {
		if chunk.Type == "text" {
			output.WriteString(chunk.Content)
		}
	})
	if result != nil && result.Output == "" {
		result.Output = output.String()
	}
	return result, err
}

func (s *sessionService) RunStream(ctx context.Context, input agent.RunInput, onChunk func(agent.StreamChunk)) (*agent.RunResult, error) {
	start := time.Now()
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return &agent.RunResult{Success: false, Error: "Prompt is empty.", ExitCode: -1}, nil
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	conn, err := s.acpClient.Start(runCtx, s.clientInfo, s.protocol, func(update acp.SessionUpdate) {
		if onChunk == nil {
			return
		}
		switch update.Update {
		case "agent_message_chunk":
			if update.Text != "" {
				onChunk(agent.StreamChunk{Type: "text", Content: update.Text, MessageID: update.MessageID})
			}
		case "agent_thought_chunk":
			onChunk(agent.StreamChunk{Type: "reasoning", Content: update.Text, MessageID: update.MessageID})
		case "tool_call_update":
			label := update.Status
			if label == "" {
				label = "tool update"
			}
			onChunk(agent.StreamChunk{Type: "tool", Content: label, MessageID: update.MessageID})
		case "turn_completed", "item_completed":
			onChunk(agent.StreamChunk{Type: "status", Content: update.Update, MessageID: update.MessageID})
		case "thread_started":
			onChunk(agent.StreamChunk{Type: "status", Content: "Thread started", MessageID: update.MessageID})
		default:
			onChunk(agent.StreamChunk{Type: "status", Content: update.Update, MessageID: update.MessageID})
		}
	})
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	var threadID string
	if input.SessionID != "" {
		result, err := conn.LoadSession(runCtx, input.SessionID, "")
		if err != nil {
			return nil, err
		}
		threadID = result.SessionID
	} else {
		result, err := conn.NewSession(runCtx, input.WorkingDir)
		if err != nil {
			return nil, err
		}
		threadID = result.SessionID
	}

	s.active.Set(threadID, cancel)
	defer s.active.Delete(threadID)

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "status", Content: "Thread initialized", MessageID: ""})
	}

	modelID := ""
	if input.Model != nil {
		modelID = input.Model.ModelID
	}

	promptResult, err := conn.Prompt(
		runCtx,
		threadID,
		prompt,
		strings.TrimSpace(input.Agent),
		modelID,
	)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(runCtx.Err(), context.Canceled) {
			return &agent.RunResult{
				Success:   false,
				Error:     "Codex run aborted.",
				ExitCode:  -1,
				Duration:  time.Since(start),
				SessionID: threadID,
			}, nil
		}
		return nil, err
	}

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "complete", Content: promptResult.StopReason, IsComplete: true})
	}

	return &agent.RunResult{
		Success:   true,
		Output:    "",
		ExitCode:  0,
		Duration:  time.Since(start),
		SessionID: threadID,
	}, nil
}

func (s *sessionService) Abort(ctx context.Context, sessionID string, _ string) (bool, error) {
	cancel, ok := s.active.Get(sessionID)
	if !ok {
		return false, fmt.Errorf("session %q is not active", sessionID)
	}
	cancel()
	return true, nil
}

func parseTime(value string) time.Time {
	if value == "" {
		return time.Now().UTC()
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Now().UTC()
	}
	return parsed
}

func (s *activeRunStore) Set(sessionID string, cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[sessionID] = cancel
}

func (s *activeRunStore) Delete(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.runs, sessionID)
}

func (s *activeRunStore) Get(sessionID string) (context.CancelFunc, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cancel, ok := s.runs[sessionID]
	return cancel, ok
}

func (s *activeRunStore) Has(sessionID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.runs[sessionID]
	return ok
}
