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
	"relaid/internal/providers/acp"
	sdkclient "relaid/internal/providers/opencode/sdk"
	skillpkg "relaid/internal/skills"
)

const defaultProviderTimeout = 20 * time.Second
const defaultServerStartupTimeout = 60 * time.Second

type Provider struct {
	id           agent.ProviderID
	capabilities agent.CapabilitySet
	sessions     *sessionService
	projects     *projectService
	providers    *providerService
	agents       *agentService
	skills       *skillService
	serverMgr    *ServerManager
}

func New(cfg config.Config, logger *log.Logger) *Provider {
	var sdk *sdkclient.Adapter
	var serverMgr *ServerManager

	if cfg.OpencodeBaseURL != "" {
		sdk = sdkclient.New(cfg.OpencodeBaseURL, cfg.OpencodeCwd)
	} else {
		serverMgr = NewServerManager(cfg.OpencodeBin, cfg.OpencodeCwd, logger)
		sdk = sdkclient.NewLazy(cfg.OpencodeCwd, func(ctx context.Context) (string, error) {
			startCtx, cancel := context.WithTimeout(context.Background(), defaultServerStartupTimeout)
			defer cancel()
			return serverMgr.Start(startCtx)
		})
	}

	acpClient := acp.NewClient(cfg.OpencodeBin, cfg.OpencodeCwd, logger)
	protocol := NewOpenCodeProtocol()
	activeRuns := &activeRunStore{runs: map[string]context.CancelFunc{}}

	provider := &Provider{
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
			AgentsList:     true,
			SkillsList:     true,
		},
		sessions: &sessionService{
			cfg:       cfg,
			logger:    logger,
			acpClient: acpClient,
			protocol:  protocol,
			sdk:       sdk,
			active:    activeRuns,
			clientInfo: acp.ClientInfo{
				Name:    "relaid-go",
				Title:   "Relaid Go Server",
				Version: "0.0.1",
			},
		},
		projects:  &projectService{sdk: sdk},
		providers: &providerService{sdk: sdk},
		agents:    &agentService{sdk: sdk},
		skills:    &skillService{sdk: sdk, logger: logger},
		serverMgr: serverMgr,
	}

	if serverMgr != nil {
		go func() {
			startCtx, cancel := context.WithTimeout(context.Background(), defaultServerStartupTimeout)
			defer cancel()
			if _, err := serverMgr.Start(startCtx); err != nil {
				logger.Printf("opencode: background warmup failed: %v", err)
			}
		}()
	}

	return provider
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

func (p *Provider) Agents() agent.AgentService {
	return p.agents
}

func (p *Provider) Skills() agent.SkillsService {
	return p.skills
}

func (p *Provider) SetInteractionHandler(handler acp.InteractionHandler) {
	p.sessions.acpClient.SetInteractionHandler(handler)
}

func (p *Provider) Shutdown(context.Context) error {
	if p.serverMgr != nil {
		p.serverMgr.Stop()
	}
	return nil
}

type projectService struct {
	sdk *sdkclient.Adapter
}

func (s *projectService) List(ctx context.Context) ([]agent.Project, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.ListProjects(ctx)
}

func (s *projectService) Get(ctx context.Context, id string) (*agent.Project, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.GetProject(ctx, id)
}

func (s *projectService) ResolveIDByDirectory(ctx context.Context, directory string) (string, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.ResolveProjectByDirectory(ctx, directory)
}

func (s *projectService) FileSearch(ctx context.Context, projectID string, query string, limit int) ([]agent.FileMatch, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.SearchFiles(ctx, projectID, query, limit)
}

type providerService struct {
	sdk *sdkclient.Adapter
}

func (s *providerService) List(ctx context.Context) ([]agent.Provider, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.ListProviders(ctx)
}

type agentService struct {
	sdk *sdkclient.Adapter
}

func (s *agentService) List(ctx context.Context, directory string) ([]agent.AgentConfig, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.ListAgents(ctx, directory)
}

type skillService struct {
	sdk    *sdkclient.Adapter
	logger *log.Logger
}

func (s *skillService) List(ctx context.Context, projectID string, query string) ([]agent.Skill, error) {
	worktree := ""
	if projectID != "" {
		project, err := s.sdk.GetProject(ctx, projectID)
		if err != nil {
			if _, statErr := os.Stat(projectID); statErr == nil {
				worktree = projectID
			} else {
				s.logger.Printf("[skills] project lookup error for %q: %v", projectID, err)
			}
		} else if project != nil {
			worktree = project.Worktree
		}
	}

	if worktree == "" {
		worktree = s.sdk.Cwd()
	}

	s.logger.Printf("[skills-debug] skillService.List: projectID=%q worktree=%q query=%q", projectID, worktree, query)

	skills, err := skillpkg.LoadAll(skillpkg.OpenCode, worktree)
	if err != nil {
		s.logger.Printf("[skills-debug] skillService.List: LoadAll error: %v", err)
		return nil, err
	}

	if query != "" {
		lower := strings.ToLower(query)
		filtered := make([]agent.Skill, 0, len(skills))
		for _, s := range skills {
			if strings.Contains(strings.ToLower(s.Name), lower) || strings.Contains(strings.ToLower(s.Description), lower) {
				filtered = append(filtered, agent.Skill{
					Name:        s.Name,
					Description: s.Description,
					Source:      s.Source,
				})
			}
		}
		s.logger.Printf("[skills-debug] skillService.List: %d skills after filter (query=%q)", len(filtered), query)
		return filtered, nil
	}

	result := make([]agent.Skill, 0, len(skills))
	for _, s := range skills {
		result = append(result, agent.Skill{
			Name:        s.Name,
			Description: s.Description,
			Source:      s.Source,
		})
	}

	s.logger.Printf("[skills-debug] skillService.List: %d skills total", len(result))
	return result, nil
}

type sessionService struct {
	cfg        config.Config
	logger     *log.Logger
	acpClient  *acp.Client
	protocol   *OpenCodeProtocol
	sdk        *sdkclient.Adapter
	active     *activeRunStore
	clientInfo acp.ClientInfo
}

type activeRunStore struct {
	mu   sync.Mutex
	runs map[string]context.CancelFunc
}

func (s *sessionService) List(ctx context.Context, filters agent.SessionFilters) ([]agent.Session, string, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	if filters.Cwd != "" {
		if _, err := os.Stat(filters.Cwd); err != nil {
			return nil, "", fmt.Errorf("invalid cwd: %w", err)
		}
	}

	conn, err := s.acpClient.Start(ctx, s.clientInfo, s.protocol, nil)
	if err != nil {
		return nil, "", err
	}
	defer conn.Close()

	result, err := conn.ListSessions(ctx, filters.Cwd, "")
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
	return filtered, "", nil
}

func (s *sessionService) Get(ctx context.Context, id string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

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

func (s *sessionService) Messages(ctx context.Context, id string, limit int) ([]agent.SessionMessagesResponse, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.GetSessionMessages(ctx, id, limit)
}

func (s *sessionService) Diff(ctx context.Context, id string, messageID string) ([]agent.FileDiff, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()
	return s.sdk.GetSessionDiff(ctx, id, messageID)
}

func (s *sessionService) Create(ctx context.Context, projectID string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	workingDir, err := s.sdk.EnsureProjectDirectory(ctx, projectID, "")
	if err != nil {
		return nil, fmt.Errorf("resolve project directory: %w", err)
	}

	conn, err := s.acpClient.Start(ctx, s.clientInfo, s.protocol, nil)
	if err != nil {
		return nil, fmt.Errorf("start acp connection: %w", err)
	}
	defer conn.Close()

	result, err := conn.NewSession(ctx, workingDir)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	now := time.Now().UTC()
	return &agent.Session{
		ID:        result.SessionID,
		ProjectID: projectID,
		Directory: workingDir,
		Status:    agent.SessionCompleted,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
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

	workingDir, err := s.sdk.EnsureProjectDirectory(ctx, input.ProjectID, input.WorkingDir)
	if err != nil {
		return &agent.RunResult{Success: false, Error: err.Error(), ExitCode: -1}, nil
	}
	if _, err := os.Stat(workingDir); err != nil {
		return &agent.RunResult{Success: false, Error: fmt.Sprintf("Working directory is invalid: %s", workingDir), ExitCode: -1}, nil
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
		s.logger.Printf("ACP model override: %s", modelID)
	}

	result, err := conn.Prompt(
		runCtx,
		sessionID,
		effectivePrompt,
		strings.TrimSpace(input.Agent),
		modelID,
	)
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

func withTimeout(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		if ctx == nil {
			return context.Background(), func() {}
		}
		return ctx, func() {}
	}

	if ctx == nil {
		return context.WithTimeout(context.Background(), timeout)
	}

	deadline, ok := ctx.Deadline()
	if ok && time.Until(deadline) <= timeout {
		return ctx, func() {}
	}

	return context.WithTimeout(ctx, timeout)
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
