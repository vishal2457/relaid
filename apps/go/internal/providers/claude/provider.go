package claude

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/bridge"
	"relaid/internal/config"
	"relaid/internal/providers/acp"
	skillpkg "relaid/internal/skills"
	"relaid/internal/workspace"

	opencode "github.com/sst/opencode-sdk-go"
)

const defaultProviderTimeout = 20 * time.Second

type Provider struct {
	id           agent.ProviderID
	capabilities agent.CapabilitySet
	projects     *projectService
	sessions     *sessionService
	providers    *providerService
	agents       *agentService
	skills       *skillService
	apps         *appService
}

func New(cfg config.Config, bridgeMgr *bridge.Manager, workspaces *workspace.Service, logger *log.Logger) *Provider {
	sessions := &sessionService{
		cfg:        cfg,
		logger:     logger,
		bridge:     bridgeMgr,
		workspaces: workspaces,
		active:     &activeRunStore{runs: map[string]context.CancelFunc{}},
		handler:    &acp.DenyHandler{},
	}

	return &Provider{
		id: agent.ProviderClaude,
		capabilities: agent.CapabilitySet{
			ProjectsList:   true,
			ProjectsGet:    true,
			SessionsList:   true,
			SessionsGet:    true,
			SessionsMsgs:   true,
			SessionsDiff:   false,
			SessionsAbort:  true,
			SessionsRun:    true,
			SessionsStream: true,
			ProvidersList:  true,
			AgentsList:     true,
			SkillsList:     true,
			AppsList:       true,
		},
		projects: &projectService{
			bridge:     bridgeMgr,
			workspaces: workspaces,
		},
		sessions: sessions,
		providers: &providerService{
			cfg:    cfg,
			bridge: bridgeMgr,
		},
		agents: &agentService{
			cfg:    cfg,
			bridge: bridgeMgr,
		},
		skills: &skillService{
			cfg:       cfg,
			workspaces: workspaces,
			logger:    logger,
		},
		apps: &appService{
			cfg:    cfg,
			bridge: bridgeMgr,
		},
	}
}

func (p *Provider) ID() agent.ProviderID      { return p.id }
func (p *Provider) Capabilities() agent.CapabilitySet { return p.capabilities }
func (p *Provider) Projects() agent.ProjectService    { return p.projects }
func (p *Provider) Sessions() agent.SessionService    { return p.sessions }
func (p *Provider) Providers() agent.ProviderService  { return p.providers }
func (p *Provider) Agents() agent.AgentService        { return p.agents }
func (p *Provider) Skills() agent.SkillsService       { return p.skills }
func (p *Provider) Apps() agent.AppService            { return p.apps }
func (p *Provider) Shutdown(context.Context) error    { return nil }

func (p *Provider) SetInteractionHandler(handler acp.InteractionHandler) {
	if handler == nil {
		p.sessions.handler = &acp.DenyHandler{}
		return
	}
	p.sessions.handler = handler
}

type projectService struct {
	bridge     *bridge.Manager
	workspaces *workspace.Service
}

func (s *projectService) List(ctx context.Context) ([]agent.Project, error) {
	items, err := s.workspaces.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]agent.Project, 0, len(items))
	for _, item := range items {
		updatedAt := item.UpdatedAt
		result = append(result, agent.Project{
			ID:          item.Key,
			Worktree:    item.Directory,
			CreatedAt:   item.CreatedAt,
			Initialized: &updatedAt,
		})
	}
	return result, nil
}

func (s *projectService) Get(ctx context.Context, id string) (*agent.Project, error) {
	item, err := s.workspaces.GetByKey(ctx, id)
	if err != nil || item == nil {
		return nil, err
	}
	updatedAt := item.UpdatedAt
	project := agent.Project{
		ID:          item.Key,
		Worktree:    item.Directory,
		CreatedAt:   item.CreatedAt,
		Initialized: &updatedAt,
	}
	return &project, nil
}

func (s *projectService) ResolveIDByDirectory(_ context.Context, directory string) (string, error) {
	if strings.TrimSpace(directory) == "" {
		return "", fmt.Errorf("directory is required")
	}
	return directory, nil
}

func (s *projectService) FileSearch(ctx context.Context, projectID string, query string, limit int) ([]agent.FileMatch, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	var result []claudeFileMatch
	if err := s.bridge.Call(ctx, "claude/projects/fileSearch", map[string]any{
		"root":  projectID,
		"query": query,
		"limit": limit,
	}, &result); err != nil {
		return nil, err
	}

	matches := make([]agent.FileMatch, 0, len(result))
	for _, item := range result {
		matches = append(matches, agent.FileMatch{
			Name: item.Name,
			Path: item.Path,
			Type: item.Type,
		})
	}
	return matches, nil
}

type providerService struct {
	cfg    config.Config
	bridge *bridge.Manager
}

func (s *providerService) List(ctx context.Context) ([]agent.Provider, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	var result []claudeProviderPayload
	if err := s.bridge.Call(ctx, "claude/providers/list", map[string]any{
		"cwd": s.cfg.ClaudeCwd,
	}, &result); err != nil {
		return nil, err
	}

	providers := make([]agent.Provider, 0, len(result))
	for _, item := range result {
		models := make([]agent.Model, 0, len(item.Models))
		for _, model := range item.Models {
			models = append(models, agent.Model{
				ID:   model.ID,
				Name: firstNonEmpty(model.Name, model.ID),
			})
		}
		providers = append(providers, agent.Provider{
			ID:     item.ID,
			Name:   item.Name,
			Models: models,
		})
	}
	return providers, nil
}

type agentService struct {
	cfg    config.Config
	bridge *bridge.Manager
}

func (s *agentService) List(ctx context.Context, directory string) ([]agent.AgentConfig, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	cwd := firstNonEmpty(directory, s.cfg.ClaudeCwd)
	var result []claudeAgentPayload
	if err := s.bridge.Call(ctx, "claude/agents/list", map[string]any{
		"cwd": cwd,
	}, &result); err != nil {
		return nil, err
	}

	agents := make([]agent.AgentConfig, 0, len(result))
	for _, item := range result {
		agents = append(agents, agent.AgentConfig{
			Name:        item.Name,
			Description: item.Description,
			Mode:        item.Mode,
			BuiltIn:     item.BuiltIn,
			Hidden:      item.Hidden,
			Tools:       append([]string(nil), item.Tools...),
		})
	}
	sort.Slice(agents, func(i, j int) bool {
		return strings.ToLower(agents[i].Name) < strings.ToLower(agents[j].Name)
	})
	return agents, nil
}

type skillService struct {
	cfg        config.Config
	workspaces *workspace.Service
	logger     *log.Logger
}

func (s *skillService) List(ctx context.Context, projectID string, query string) ([]agent.Skill, error) {
	worktree := s.cfg.ClaudeCwd
	if projectID != "" && s.workspaces != nil {
		item, err := s.workspaces.GetByKey(ctx, projectID)
		if err == nil && item != nil {
			worktree = item.Directory
		}
	}

	skills, err := skillpkg.LoadAll(skillpkg.ClaudeCode, worktree)
	if err != nil {
		return nil, err
	}

	result := make([]agent.Skill, 0, len(skills))
	for _, item := range skills {
		if query != "" {
			lower := strings.ToLower(query)
			if !strings.Contains(strings.ToLower(item.Name), lower) && !strings.Contains(strings.ToLower(item.Description), lower) {
				continue
			}
		}
		result = append(result, agent.Skill{
			Name:        item.Name,
			Description: item.Description,
			Source:      item.Source,
		})
	}
	return result, nil
}

type appService struct {
	cfg    config.Config
	bridge *bridge.Manager
}

func (s *appService) List(ctx context.Context, input agent.AppListInput) ([]agent.App, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	var result []claudeAppPayload
	if err := s.bridge.Call(ctx, "claude/apps/list", map[string]any{
		"cwd": s.cfg.ClaudeCwd,
	}, &result); err != nil {
		return nil, err
	}

	apps := make([]agent.App, 0, len(result))
	for _, item := range result {
		apps = append(apps, agent.App{
			ID:           item.ID,
			Name:         item.Name,
			Description:  item.Description,
			IsAccessible: item.IsAccessible,
			IsEnabled:    item.IsEnabled,
			Labels:       append([]string(nil), item.Labels...),
		})
	}
	return apps, nil
}

type sessionService struct {
	cfg        config.Config
	logger     *log.Logger
	bridge     *bridge.Manager
	workspaces *workspace.Service
	active     *activeRunStore
	handler    acp.InteractionHandler
}

func (s *sessionService) List(ctx context.Context, filters agent.SessionFilters) ([]agent.Session, string, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	directories, err := s.resolveDirectories(ctx, filters.Cwd)
	if err != nil {
		return nil, "", err
	}

	seen := map[string]bool{}
	sessions := make([]agent.Session, 0)
	limit := filters.Limit
	for _, directory := range directories {
		var result []claudeSessionPayload
		if err := s.bridge.Call(ctx, "claude/sessions/list", map[string]any{
			"cwd":    directory,
			"limit":  limit,
			"offset": 0,
		}, &result); err != nil {
			continue
		}
		for _, item := range result {
			if seen[item.ID] {
				continue
			}
			seen[item.ID] = true
			session := s.mapSession(item)
			if filters.Status != "" && string(session.Status) != filters.Status {
				continue
			}
			sessions = append(sessions, session)
		}
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
	})
	if limit > 0 && len(sessions) > limit {
		sessions = sessions[:limit]
	}
	return sessions, "", nil
}

func (s *sessionService) Get(ctx context.Context, id string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	result, err := s.findSession(ctx, id)
	if err != nil || result == nil {
		return nil, err
	}
	session := s.mapSession(*result)
	return &session, nil
}

func (s *sessionService) Create(ctx context.Context, projectID string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	directory := firstNonEmpty(projectID, s.cfg.ClaudeCwd)
	var result claudeSessionPayload
	if err := s.bridge.Call(ctx, "claude/sessions/create", map[string]any{
		"cwd": directory,
	}, &result); err != nil {
		return nil, err
	}
	session := s.mapSession(result)
	return &session, nil
}

func (s *sessionService) Messages(ctx context.Context, id string, limit int) ([]agent.SessionMessagesResponse, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	session, err := s.findSession(ctx, id)
	if err != nil || session == nil {
		return nil, err
	}

	var result []claudeMessagePayload
	if err := s.bridge.Call(ctx, "claude/sessions/messages", map[string]any{
		"cwd":       session.Directory,
		"sessionId": id,
		"limit":     limit,
	}, &result); err != nil {
		return nil, err
	}
	return mapClaudeMessages(id, result), nil
}

func (s *sessionService) Diff(context.Context, string, string) ([]agent.FileDiff, error) {
	return nil, fmt.Errorf("not implemented: Claude diff retrieval is not wired")
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
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sessionID := strings.TrimSpace(input.SessionID)
	if sessionID == "" {
		sessionID = fmt.Sprintf("claude-%d", time.Now().UnixNano())
	}
	s.active.Set(sessionID, cancel)
	defer s.active.Delete(sessionID)

	cwd := firstNonEmpty(input.WorkingDir, s.cfg.ClaudeCwd)
	if input.ProjectID != "" && cwd == "" && s.workspaces != nil {
		if item, err := s.workspaces.GetByKey(runCtx, input.ProjectID); err == nil && item != nil {
			cwd = item.Directory
		}
	}
	requestID := fmt.Sprintf("run-%d", time.Now().UnixNano())

	unsubChunks := s.bridge.Subscribe("claude/sessions/run/chunk", func(raw json.RawMessage) {
		var payload struct {
			ID        string           `json:"id"`
			SessionID string           `json:"sessionId"`
			Chunk     claudeRunChunk   `json:"chunk"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			return
		}
		if payload.ID != requestID || payload.SessionID != sessionID || onChunk == nil {
			return
		}
		onChunk(agent.StreamChunk{
			Type:       payload.Chunk.Type,
			Content:    payload.Chunk.Content,
			MessageID:  payload.Chunk.MessageID,
			IsComplete: payload.Chunk.IsComplete,
		})
	})
	defer unsubChunks()

	unsubPermissions := s.bridge.Subscribe("claude/permission/request", func(raw json.RawMessage) {
		var payload claudePermissionRequestPayload
		if err := json.Unmarshal(raw, &payload); err != nil {
			return
		}
		if payload.ID != requestID || payload.SessionID != sessionID {
			return
		}

		handler := s.handler
		if handler == nil {
			handler = &acp.DenyHandler{}
		}
		resp, err := handler.HandlePermission(context.Background(), acp.ACPPermissionRequest{
			SessionID: sessionID,
			Method:    payload.ToolName,
			Options: []acp.PermissionOption{
				{OptionID: "allow", Kind: "allow"},
				{OptionID: "deny", Kind: "deny"},
			},
			ToolCall: &acp.ToolCallUpdate{
				ToolCallID: payload.RequestID,
				Title:      payload.Title,
				Kind:       payload.ToolName,
			},
		})
		behavior := "deny"
		message := "Permission denied"
		if err == nil && (resp.OptionID == "allow" || resp.Outcome == "approved") {
			behavior = "allow"
			message = ""
		}
		_ = s.bridge.Call(context.Background(), "claude/permission/respond", map[string]any{
			"requestId": payload.RequestID,
			"behavior":  behavior,
			"message":   message,
		}, nil)
	})
	defer unsubPermissions()

	var result claudeRunResultPayload
	if err := s.bridge.Call(runCtx, "claude/sessions/run", map[string]any{
		"requestId":      requestID,
		"cwd":            cwd,
		"sessionId":      sessionID,
		"prompt":         input.Prompt,
		"agent":          input.Agent,
		"systemPrompt":   input.SystemPrompt,
		"model":          modelID(input.Model),
		"permissionMode": permissionModeFromAgent(input.Agent),
	}, &result); err != nil {
		return nil, err
	}

	return &agent.RunResult{
		Success:   result.Success,
		Output:    result.Output,
		Error:     result.Error,
		ExitCode:  result.ExitCode,
		Duration:  time.Since(start),
		SessionID: firstNonEmpty(result.SessionID, sessionID),
	}, nil
}

func (s *sessionService) Abort(ctx context.Context, sessionID string, _ string) (bool, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	var ok bool
	if err := s.bridge.Call(ctx, "claude/sessions/abort", map[string]any{
		"sessionId": sessionID,
	}, &ok); err != nil {
		return false, err
	}
	return ok, nil
}

func (s *sessionService) resolveDirectories(ctx context.Context, cwd string) ([]string, error) {
	if strings.TrimSpace(cwd) != "" {
		return []string{cwd}, nil
	}
	if s.workspaces == nil {
		return []string{s.cfg.ClaudeCwd}, nil
	}
	items, err := s.workspaces.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, item.Directory)
	}
	if len(result) == 0 {
		result = append(result, s.cfg.ClaudeCwd)
	}
	return result, nil
}

func (s *sessionService) findSession(ctx context.Context, sessionID string) (*claudeSessionPayload, error) {
	directories, err := s.resolveDirectories(ctx, "")
	if err != nil {
		return nil, err
	}
	for _, directory := range directories {
		var result *claudeSessionPayload
		if err := s.bridge.Call(ctx, "claude/sessions/get", map[string]any{
			"cwd":       directory,
			"sessionId": sessionID,
		}, &result); err == nil && result != nil {
			return result, nil
		}
	}
	return nil, nil
}

func (s *sessionService) mapSession(value claudeSessionPayload) agent.Session {
	status := mapSessionStatus(value.Status)
	if s.active.Has(value.ID) {
		status = agent.SessionRunning
	}

	projectID := value.Directory
	if s.workspaces != nil {
		if item, err := s.workspaces.GetByDirectory(context.Background(), value.Directory); err == nil && item != nil {
			projectID = item.Key
		}
	}

	return agent.Session{
		ID:        value.ID,
		ProjectID: projectID,
		Directory: value.Directory,
		Title:     value.Title,
		Status:    status,
		CreatedAt: time.UnixMilli(value.CreatedAt).UTC(),
		UpdatedAt: time.UnixMilli(value.UpdatedAt).UTC(),
	}
}

type activeRunStore struct {
	mu   sync.Mutex
	runs map[string]context.CancelFunc
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

func (s *activeRunStore) Has(sessionID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.runs[sessionID]
	return ok
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

func mapClaudeMessages(sessionID string, messages []claudeMessagePayload) []agent.SessionMessagesResponse {
	envelopes := make([]agent.SessionMessagesResponse, 0, len(messages))
	for index, item := range messages {
		parts := make([]opencode.Part, 0, 1)
		messageID := item.ID
		if messageID == "" {
			messageID = fmt.Sprintf("%s-%d", sessionID, index)
		}

		switch item.Kind {
		case "reasoning":
			parts = append(parts, opencode.Part{
				ID:        messageID + "-reasoning",
				MessageID: messageID,
				SessionID: sessionID,
				Type:      opencode.PartTypeReasoning,
				Text:      item.Content,
			})
		case "tool":
			parts = append(parts, opencode.Part{
				ID:        messageID + "-tool",
				MessageID: messageID,
				SessionID: sessionID,
				Type:      opencode.PartTypeTool,
				Tool:      firstNonEmpty(item.ToolName, "tool"),
				State: opencode.ToolPartState{
					Status: "completed",
					Title:  firstNonEmpty(item.ToolName, "tool"),
					Output: item.Content,
				},
			})
		case "status":
			parts = append(parts, opencode.Part{
				ID:        messageID + "-status",
				MessageID: messageID,
				SessionID: sessionID,
				Type:      opencode.PartTypeText,
				Text:      item.Content,
			})
		default:
			parts = append(parts, opencode.Part{
				ID:        messageID + "-text",
				MessageID: messageID,
				SessionID: sessionID,
				Type:      opencode.PartTypeText,
				Text:      item.Content,
			})
		}

		info, _ := json.Marshal(map[string]any{
			"id":   messageID,
			"role": item.Role,
		})
		envelopes = append(envelopes, agent.SessionMessagesResponse{
			Info:  info,
			Parts: parts,
		})
	}
	return envelopes
}

func modelID(ref *agent.ModelRef) string {
	if ref == nil {
		return ""
	}
	return strings.TrimSpace(ref.ModelID)
}

func permissionModeFromAgent(agentName string) string {
	switch strings.TrimSpace(agentName) {
	case "acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto", "default":
		return strings.TrimSpace(agentName)
	default:
		return "default"
	}
}

func mapSessionStatus(value string) agent.SessionState {
	switch value {
	case "pending":
		return agent.SessionPending
	case "running":
		return agent.SessionRunning
	case "failed":
		return agent.SessionFailed
	case "aborted":
		return agent.SessionAborted
	default:
		return agent.SessionCompleted
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

type claudeFileMatch struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
}

type claudeProviderPayload struct {
	ID     string               `json:"id"`
	Name   string               `json:"name"`
	Models []claudeModelPayload `json:"models"`
}

type claudeModelPayload struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type claudeAgentPayload struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Mode        string   `json:"mode"`
	BuiltIn     bool     `json:"builtIn"`
	Hidden      bool     `json:"hidden"`
	Tools       []string `json:"tools"`
}

type claudeAppPayload struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	IsAccessible bool     `json:"isAccessible"`
	IsEnabled    bool     `json:"isEnabled"`
	Labels       []string `json:"labels"`
}

type claudeSessionPayload struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Directory string `json:"directory"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	Status    string `json:"status"`
}

type claudeMessagePayload struct {
	ID       string         `json:"id"`
	Role     string         `json:"role"`
	Content  string         `json:"content"`
	Kind     string         `json:"kind"`
	ToolName string         `json:"toolName,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
}

type claudeRunChunk struct {
	Type       string `json:"type"`
	Content    string `json:"content"`
	MessageID  string `json:"messageId,omitempty"`
	IsComplete bool   `json:"isComplete,omitempty"`
}

type claudeRunResultPayload struct {
	Success    bool   `json:"success"`
	Output     string `json:"output"`
	Error      string `json:"error,omitempty"`
	ExitCode   int    `json:"exitCode"`
	DurationMs int64  `json:"durationMs"`
	SessionID  string `json:"sessionId"`
}

type claudePermissionRequestPayload struct {
	ID          string `json:"id"`
	RequestID   string `json:"requestId"`
	SessionID   string `json:"sessionId"`
	ToolName    string `json:"toolName"`
	Title       string `json:"title"`
	Description string `json:"description"`
}
