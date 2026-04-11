package opencode

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/config"
	acpclient "relaid/internal/providers/opencode/acp"
	sdkclient "relaid/internal/providers/opencode/sdk"
)

type Provider struct {
	id           agent.ProviderID
	capabilities agent.CapabilitySet
	sessions     *sessionService
	projects     *projectService
	providers    *providerService
}

func New(cfg config.Config, logger *log.Logger) *Provider {
	sdk := sdkclient.New(cfg.OpencodeBaseURL, cfg.OpencodeCwd)
	acp := acpclient.NewClient(cfg.OpencodeBin, cfg.OpencodeCwd, logger)
	activeRuns := &activeRunStore{runs: map[string]context.CancelFunc{}}

	return &Provider{
		id: agent.ProviderOpencode,
		capabilities: agent.CapabilitySet{
			ProjectsList:   true,
			ProjectsGet:    true,
			SessionsList:   true,
			SessionsGet:    true,
			SessionsMsgs:   true,
			SessionsDiff:   true,
			SessionsAbort:  true,
			SessionsRun:    true,
			SessionsStream: true,
			ProvidersList:  true,
		},
		sessions: &sessionService{
			cfg:    cfg,
			logger: logger,
			acp:    acp,
			sdk:    sdk,
			active: activeRuns,
			clientInfo: acpclient.ClientInfo{
				Name:    "relaid-go",
				Title:   "Relaid Go Server",
				Version: "0.0.1",
			},
		},
		projects:  &projectService{sdk: sdk},
		providers: &providerService{sdk: sdk},
	}
}

func (p *Provider) ID() agent.ProviderID {
	return p.id
}

func (p *Provider) Capabilities() agent.CapabilitySet {
	return p.capabilities
}

func (p *Provider) Projects() agent.ProjectService {
	return p.projects
}

func (p *Provider) Sessions() agent.SessionService {
	return p.sessions
}

func (p *Provider) Providers() agent.ProviderService {
	return p.providers
}

func (p *Provider) Shutdown(context.Context) error {
	return nil
}

type projectService struct {
	sdk *sdkclient.Adapter
}

func (s *projectService) List(ctx context.Context) ([]agent.Project, error) {
	return s.sdk.ListProjects(ctx)
}

func (s *projectService) Get(ctx context.Context, id string) (*agent.Project, error) {
	return s.sdk.GetProject(ctx, id)
}

type providerService struct {
	sdk *sdkclient.Adapter
}

func (s *providerService) List(ctx context.Context) ([]agent.Provider, error) {
	return s.sdk.ListProviders(ctx)
}

type sessionService struct {
	cfg        config.Config
	logger     *log.Logger
	acp        *acpclient.Client
	sdk        *sdkclient.Adapter
	active     *activeRunStore
	clientInfo acpclient.ClientInfo
}

type activeRunStore struct {
	mu   sync.Mutex
	runs map[string]context.CancelFunc
}

func (s *sessionService) List(ctx context.Context, filters agent.SessionFilters) ([]agent.Session, string, error) {
	result, err := s.acp.ListSessions(ctx, s.clientInfo, filters.Cursor)
	if err != nil {
		return nil, "", err
	}

	sessions := make([]agent.Session, 0, len(result.Sessions))
	for _, session := range result.Sessions {
		projectID, err := s.sdk.ResolveProjectByDirectory(ctx, session.Cwd)
		if err != nil {
			return nil, "", err
		}

		updatedAt := parseTime(session.UpdatedAt)
		status := agent.SessionCompleted
		if s.active.Has(session.SessionID) {
			status = agent.SessionRunning
		}

		value := agent.Session{
			ID:        session.SessionID,
			ProjectID: projectID,
			Directory: session.Cwd,
			Title:     session.Title,
			Version:   "acp",
			Status:    status,
			CreatedAt: updatedAt,
			UpdatedAt: updatedAt,
		}

		if filters.ProjectID != "" && value.ProjectID != filters.ProjectID {
			continue
		}
		if filters.Status != "" && string(value.Status) != filters.Status {
			continue
		}
		sessions = append(sessions, value)
	}

	if filters.Limit > 0 && len(sessions) > filters.Limit {
		sessions = sessions[:filters.Limit]
	}
	return sessions, result.NextCursor, nil
}

func (s *sessionService) Get(ctx context.Context, id string) (*agent.Session, error) {
	session, err := s.sdk.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, nil
	}
	if s.active.Has(id) {
		session.Status = agent.SessionRunning
	}
	return session, nil
}

func (s *sessionService) Messages(ctx context.Context, id string, limit int) ([]agent.MessageEnvelope, error) {
	return s.sdk.GetSessionMessages(ctx, id, limit)
}

func (s *sessionService) Diff(ctx context.Context, id string, messageID string) ([]agent.FileDiff, error) {
	return s.sdk.GetSessionDiff(ctx, id, messageID)
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
	maxPromptLength := s.cfg.OpencodeMaxPromptLength
	if maxPromptLength <= 0 {
		maxPromptLength = 8000
	}
	if len(prompt) > maxPromptLength {
		return &agent.RunResult{
			Success:  false,
			Error:    fmt.Sprintf("Prompt exceeds max length of %d characters.", maxPromptLength),
			ExitCode: -1,
		}, nil
	}

	workingDir, err := s.sdk.EnsureProjectDirectory(ctx, "", input.WorkingDir)
	if err != nil {
		return &agent.RunResult{Success: false, Error: err.Error(), ExitCode: -1}, nil
	}
	if _, err := os.Stat(workingDir); err != nil {
		return &agent.RunResult{Success: false, Error: fmt.Sprintf("Working directory is invalid: %s", workingDir), ExitCode: -1}, nil
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	conn, err := s.acp.Start(runCtx, s.clientInfo, func(update acpclient.SessionUpdate) {
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
		case "user_message_chunk":
			// ignore
		default:
			onChunk(agent.StreamChunk{Type: "status", Content: update.Update, MessageID: update.MessageID})
		}
	})
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	var sessionID string
	if input.SessionID != "" {
		result, err := conn.LoadSession(runCtx, input.SessionID, workingDir)
		if err != nil {
			return nil, err
		}
		sessionID = result.SessionID
	} else {
		result, err := conn.NewSession(runCtx, workingDir)
		if err != nil {
			return nil, err
		}
		sessionID = result.SessionID
	}

	s.active.Set(sessionID, cancel)
	defer s.active.Delete(sessionID)

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "status", Content: "Session initialized", MessageID: ""})
	}

	effectivePrompt := prompt
	if strings.TrimSpace(input.SystemPrompt) != "" {
		effectivePrompt = strings.TrimSpace(input.SystemPrompt) + "\n\n" + prompt
	}

	modelID := ""
	if input.Model != nil {
		modelID = strings.TrimSpace(input.Model.ProviderID + "/" + input.Model.ModelID)
	}

	result, err := conn.Prompt(runCtx, sessionID, effectivePrompt, modelID)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(runCtx.Err(), context.Canceled) {
			return &agent.RunResult{
				Success:   false,
				Error:     "OpenCode run aborted.",
				ExitCode:  -1,
				Duration:  time.Since(start),
				SessionID: sessionID,
			}, nil
		}
		return nil, err
	}

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "complete", Content: result.StopReason, IsComplete: true})
	}

	return &agent.RunResult{
		Success:   true,
		Output:    "",
		ExitCode:  0,
		Duration:  time.Since(start),
		SessionID: sessionID,
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
