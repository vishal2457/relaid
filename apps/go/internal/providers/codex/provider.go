package codex

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"relaid/internal/agent"
	"relaid/internal/config"
	"relaid/internal/providers/acp"

	opencode "github.com/sst/opencode-sdk-go"
)

const defaultProviderTimeout = 20 * time.Second

// Provider implements agent.Provider for the Codex app-server backend.
type Provider struct {
	id           agent.ProviderID
	capabilities agent.CapabilitySet
	projects     *projectService
	sessions     *sessionService
	providers    *providerService
	agents       *agentService
	apps         *appService
}

func New(cfg config.Config, logger *log.Logger) *Provider {
	client := newAppServerClient(cfg.CodexBin, cfg.CodexCwd, logger)

	p := &Provider{
		id: agent.ProviderCodex,
		capabilities: agent.CapabilitySet{
			ProjectsList:   false,
			ProjectsGet:    false,
			SessionsList:   true,
			SessionsGet:    true,
			SessionsMsgs:   true,
			SessionsDiff:   false,
			SessionsAbort:  true,
			SessionsRun:    true,
			SessionsStream: true,
			ProvidersList:  true,
			AgentsList:     true,
			SkillsList:     false,
			AppsList:       true,
		},
		projects: &projectService{client: client},
		sessions: &sessionService{
			cfg:    cfg,
			logger: logger,
			client: client,
			active: &activeRunStore{runs: map[string]context.CancelFunc{}},
		},
		providers: &providerService{client: client},
		agents:    &agentService{client: client},
		apps:      &appService{client: client},
	}

	return p
}

func (p *Provider) ID() agent.ProviderID                           { return p.id }
func (p *Provider) Capabilities() agent.CapabilitySet              { return p.capabilities }
func (p *Provider) Projects() agent.ProjectService                 { return p.projects }
func (p *Provider) Sessions() agent.SessionService                 { return p.sessions }
func (p *Provider) Providers() agent.ProviderService               { return p.providers }
func (p *Provider) Agents() agent.AgentService                     { return p.agents }
func (p *Provider) Skills() agent.SkillsService                    { return nil }
func (p *Provider) Apps() agent.AppService                         { return p.apps }
func (p *Provider) SetInteractionHandler(h acp.InteractionHandler) { p.sessions.client.handler = h }
func (p *Provider) Shutdown(context.Context) error {
	p.sessions.client.closeShared()
	return nil
}

// ---------------------------------------------------------------------------
// projectService
// ---------------------------------------------------------------------------

type projectService struct {
	client *appServerClient
}

func (s *projectService) List(context.Context) ([]agent.Project, error) {
	return nil, fmt.Errorf("not implemented: Codex project listing is not wired")
}

func (s *projectService) Get(context.Context, string) (*agent.Project, error) {
	return nil, fmt.Errorf("not implemented: Codex project lookup is not wired")
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

	root := strings.TrimSpace(projectID)
	if root == "" {
		return nil, fmt.Errorf("project root is required")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []agent.FileMatch{}, nil
	}

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	result, err := conn.fuzzyFileSearch(ctx, fuzzyFileSearchParams{
		Query: query,
		Roots: []string{root},
	})
	if err != nil {
		return nil, err
	}

	matches := make([]agent.FileMatch, 0, len(result.Files))
	for _, file := range result.Files {
		path := strings.TrimSpace(file.Path)
		if path == "" {
			continue
		}
		fileType := "file"
		if file.MatchType == "directory" {
			fileType = "directory"
		}
		matches = append(matches, agent.FileMatch{
			Name: firstNonEmpty(strings.TrimSpace(file.FileName), filepath.Base(path)),
			Path: path,
			Type: fileType,
		})
		if limit > 0 && len(matches) >= limit {
			break
		}
	}
	return matches, nil
}

// ---------------------------------------------------------------------------
// providerService
// ---------------------------------------------------------------------------

type providerService struct {
	client *appServerClient
}

func (s *providerService) List(ctx context.Context) ([]agent.Provider, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	models, err := conn.modelList(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]agent.Model, 0, len(models.Data))
	for _, item := range models.Data {
		if item.Hidden {
			continue
		}
		name := firstNonEmpty(item.DisplayName, item.Model, item.ID)
		modelID := firstNonEmpty(item.Model, item.ID)
		result = append(result, agent.Model{ID: modelID, Name: name})
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})

	return []agent.Provider{{ID: "openai", Name: "OpenAI", Models: result}}, nil
}

// ---------------------------------------------------------------------------
// agentService
// ---------------------------------------------------------------------------

type agentService struct {
	client *appServerClient
}

func (s *agentService) List(ctx context.Context, _ string) ([]agent.AgentConfig, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	modes, err := conn.collaborationModeList(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]agent.AgentConfig, 0, len(modes.Data))
	for _, item := range modes.Data {
		modeID := normalizeCollaborationMode(item.Mode)
		if modeID == "" {
			continue
		}
		result = append(result, agent.AgentConfig{
			Name:        firstNonEmpty(strings.TrimSpace(item.Name), collaborationModeDisplayName(modeID)),
			Description: collaborationModeDescription(item),
			Mode:        "primary",
			BuiltIn:     true,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		left := strings.ToLower(result[i].Name)
		right := strings.ToLower(result[j].Name)
		if left == right {
			return result[i].Description < result[j].Description
		}
		if left == "default" {
			return true
		}
		if right == "default" {
			return false
		}
		return left < right
	})

	return result, nil
}

// ---------------------------------------------------------------------------
// appService
// ---------------------------------------------------------------------------

type appService struct {
	client *appServerClient
}

func (s *appService) List(ctx context.Context, input agent.AppListInput) ([]agent.App, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 100
	}

	params := appListParams{
		ThreadID:     emptyToNil(input.ThreadID),
		Limit:        &limit,
		ForceRefetch: input.ForceRefetch,
	}

	result, err := conn.appList(ctx, params)
	if err != nil && input.ThreadID != "" {
		params.ThreadID = nil
		result, err = conn.appList(ctx, params)
	}
	if err != nil {
		return nil, err
	}
	if input.ThreadID != "" && len(result.Data) == 0 {
		params.ThreadID = nil
		result, err = conn.appList(ctx, params)
		if err != nil {
			return nil, err
		}
	}

	apps := make([]agent.App, 0, len(result.Data))
	for _, item := range result.Data {
		apps = append(apps, agent.App{
			ID:           item.ID,
			Name:         item.Name,
			Description:  item.Description,
			IsAccessible: item.IsAccessible,
			IsEnabled:    item.IsEnabled,
			Labels:       stringSlice(item.Labels),
		})
	}
	sort.Slice(apps, func(i, j int) bool {
		return strings.ToLower(apps[i].Name) < strings.ToLower(apps[j].Name)
	})

	return apps, nil
}

// ---------------------------------------------------------------------------
// sessionService
// ---------------------------------------------------------------------------

type sessionService struct {
	cfg    config.Config
	logger *log.Logger
	client *appServerClient
	active *activeRunStore
}

func (s *sessionService) List(ctx context.Context, filters agent.SessionFilters) ([]agent.Session, string, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, "", err
	}

	result, err := conn.threadList(ctx, threadListParams{
		Cursor:         emptyToNil(filters.Cursor),
		Limit:          positiveToNil(filters.Limit),
		Cwd:            cwdParam(filters.Cwd),
		ModelProviders: []string{"openai"},
	})
	if err != nil {
		return nil, "", err
	}

	sessions := make([]agent.Session, 0, len(result.Data))
	for _, t := range result.Data {
		session := mapThread(t)
		if s.active.has(session.ID) {
			session.Status = agent.SessionRunning
		}
		if filters.Status != "" && string(session.Status) != filters.Status {
			continue
		}
		sessions = append(sessions, session)
	}

	return sessions, stringValue(result.NextCursor), nil
}

func (s *sessionService) Get(ctx context.Context, id string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	result, err := conn.threadRead(ctx, id, false)
	if err != nil {
		if isThreadNotLoaded(err) {
			// Thread exists in storage but isn't loaded; find it via list.
			return s.findSessionByID(ctx, conn, id)
		}
		return nil, err
	}

	session := mapThread(result.Thread)
	if s.active.has(session.ID) {
		session.Status = agent.SessionRunning
	}
	return &session, nil
}

func (s *sessionService) findSessionByID(ctx context.Context, conn *appServerConn, threadID string) (*agent.Session, error) {
	cursor := (*string)(nil)
	limit := 100
	for {
		result, err := conn.threadList(ctx, threadListParams{
			Cursor:         cursor,
			Limit:          &limit,
			ModelProviders: []string{"openai"},
		})
		if err != nil {
			return nil, err
		}
		for _, t := range result.Data {
			if t.ID == threadID {
				session := mapThread(t)
				if s.active.has(session.ID) {
					session.Status = agent.SessionRunning
				}
				return &session, nil
			}
		}
		if result.NextCursor == nil || strings.TrimSpace(*result.NextCursor) == "" {
			break
		}
		cursor = result.NextCursor
	}
	return nil, fmt.Errorf("thread %q not found", threadID)
}

func (s *sessionService) Create(ctx context.Context, projectID string) (*agent.Session, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("start codex app-server: %w", err)
	}

	result, err := conn.threadStart(ctx, threadStartParams{
		Cwd:                    emptyToNil(projectID),
		ModelProvider:          ptr("openai"),
		ApprovalPolicy:         "on-request",
		ApprovalsReviewer:      "user",
		Sandbox:                "workspace-write",
		PersistExtendedHistory: true,
	})
	if err != nil {
		return nil, fmt.Errorf("create codex thread: %w", err)
	}

	session := mapThread(result.Thread)
	session.ProjectID = projectID
	return &session, nil
}

func (s *sessionService) Messages(ctx context.Context, id string, limit int) ([]agent.SessionMessagesResponse, error) {
	ctx, cancel := withTimeout(ctx, defaultProviderTimeout)
	defer cancel()

	conn, err := s.client.sharedConn(ctx)
	if err != nil {
		return nil, err
	}

	result, err := conn.threadRead(ctx, id, true)
	if err != nil {
		if isTurnsUnavailable(err) {
			return []agent.SessionMessagesResponse{}, nil
		}
		return nil, err
	}

	envelopes := mapCodexMessages(result.Thread.ID, result.Thread.Turns)
	if limit > 0 && len(envelopes) > limit {
		envelopes = envelopes[len(envelopes)-limit:]
	}
	return envelopes, nil
}

func (s *sessionService) Diff(context.Context, string, string) ([]agent.FileDiff, error) {
	return nil, fmt.Errorf("not implemented: Codex diff retrieval is not wired yet")
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

	// Each RunStream gets its own dedicated app-server connection so it has
	// its own notification handler and lifecycle.
	conn, err := s.client.newConn(runCtx)
	if err != nil {
		return nil, err
	}
	defer conn.close()

	var (
		output   strings.Builder
		threadID string
		turnID   string
		done     = make(chan turnCompletion, 1)
	)

	conn.setNotificationHandler(func(n serverNotification) {
		switch n.Method {
		case "thread/started":
			var p struct {
				Thread thread `json:"thread"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Thread.ID != "" {
				threadID = p.Thread.ID
			}

		case "turn/started":
			var p struct {
				Turn turn `json:"turn"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Turn.ID != "" {
				turnID = p.Turn.ID
			}

		case "item/agentMessage/delta":
			var p struct {
				ItemID string `json:"itemId"`
				Delta  string `json:"delta"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Delta != "" {
				output.WriteString(p.Delta)
				if onChunk != nil {
					onChunk(agent.StreamChunk{Type: "text", Content: p.Delta, MessageID: p.ItemID})
				}
			}

		case "item/reasoning/textDelta", "item/reasoning/summaryTextDelta":
			var p struct {
				ItemID string `json:"itemId"`
				Delta  string `json:"delta"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Delta != "" && onChunk != nil {
				onChunk(agent.StreamChunk{Type: "reasoning", Content: p.Delta, MessageID: p.ItemID})
			}

		case "item/fileChange/outputDelta":
			var p struct {
				ItemID string `json:"itemId"`
				Delta  string `json:"delta"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Delta != "" && onChunk != nil {
				onChunk(agent.StreamChunk{Type: "tool", Content: p.Delta, MessageID: p.ItemID})
			}

		case "item/started":
			if onChunk != nil {
				if label := codexItemLabel(n.Params); label != "" {
					onChunk(agent.StreamChunk{Type: "tool", Content: label})
				}
			}

		case "turn/completed":
			var p struct {
				Turn turn `json:"turn"`
			}
			if json.Unmarshal(n.Params, &p) == nil {
				select {
				case done <- turnCompletion{turn: p.Turn}:
				default:
				}
			}

		case "error":
			var p struct {
				Message string `json:"message"`
			}
			if json.Unmarshal(n.Params, &p) == nil && p.Message != "" {
				select {
				case done <- turnCompletion{err: errors.New(p.Message)}:
				default:
				}
			}
		}
	})

	// Resolve session → thread ID, then ensure the thread is running on this
	// connection via resume or start.
	threadID, err = s.resolveThread(runCtx, conn, input)
	if err != nil {
		return nil, err
	}

	s.logger.Printf("codex: using thread id: %s", threadID)
	s.active.set(threadID, cancel)
	defer s.active.delete(threadID)

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "status", Content: "Codex thread initialized"})
	}

	turnResult, err := conn.turnStart(runCtx, turnStartParams{
		ThreadID: threadID,
		Input:    buildUserInputs(prompt, input.Items),
		Cwd:      emptyToNil(input.WorkingDir),
		Model:    modelToNil(input.Model),
	})
	if err != nil {
		return nil, err
	}
	turnID = turnResult.Turn.ID
	s.logger.Printf("codex: started turn: %s", turnID)

	select {
	case completion := <-done:
		if completion.err != nil {
			return &agent.RunResult{
				Success: false, Output: output.String(),
				Error: completion.err.Error(), ExitCode: -1,
				Duration: time.Since(start), SessionID: threadID,
			}, nil
		}
		if completion.turn.Status == "failed" {
			return &agent.RunResult{
				Success: false, Output: output.String(),
				Error: completion.turn.errorMessage(), ExitCode: -1,
				Duration: time.Since(start), SessionID: threadID,
			}, nil
		}

	case <-runCtx.Done():
		if turnID != "" {
			_ = conn.turnInterrupt(context.Background(), threadID, turnID)
		}
		return &agent.RunResult{
			Success: false, Output: output.String(),
			Error: "Codex run aborted.", ExitCode: -1,
			Duration: time.Since(start), SessionID: threadID,
		}, nil
	}

	if onChunk != nil {
		onChunk(agent.StreamChunk{Type: "complete", Content: "completed", IsComplete: true})
	}

	return &agent.RunResult{
		Success: true, Output: output.String(),
		ExitCode: 0, Duration: time.Since(start), SessionID: threadID,
	}, nil
}

// resolveThread ensures the thread exists and is running on conn.
// It returns the canonical thread ID to use for the turn.
func (s *sessionService) resolveThread(ctx context.Context, conn *appServerConn, input agent.RunInput) (string, error) {
	if input.SessionID == "" {
		// No existing session — start a brand new thread.
		collaborationMode := buildCollaborationModeSelection(input.Agent, input.SystemPrompt)
		developerInstructions := emptyToNil(input.SystemPrompt)
		if collaborationMode != nil {
			developerInstructions = nil
		}
		result, err := conn.threadStart(ctx, threadStartParams{
			Model:                  modelToNil(input.Model),
			ModelProvider:          modelProviderToNil(input.Model),
			Cwd:                    emptyToNil(input.WorkingDir),
			ApprovalPolicy:         "on-request",
			ApprovalsReviewer:      "user",
			Sandbox:                "workspace-write",
			DeveloperInstructions:  developerInstructions,
			CollaborationMode:      collaborationMode,
			PersistExtendedHistory: true,
		})
		if err != nil {
			return "", fmt.Errorf("thread/start: %w", err)
		}
		return result.Thread.ID, nil
	}

	// Attempt to resume the existing thread on this connection.
	result, err := conn.threadResume(ctx, threadResumeParams{
		ThreadID:               input.SessionID,
		Model:                  modelToNil(input.Model),
		ModelProvider:          modelProviderToNil(input.Model),
		Cwd:                    emptyToNil(input.WorkingDir),
		ApprovalPolicy:         "on-request",
		ApprovalsReviewer:      "user",
		Sandbox:                "workspace-write",
		CollaborationMode:      buildCollaborationModeSelection(input.Agent, input.SystemPrompt),
		PersistExtendedHistory: true,
		ExcludeTurns:           true,
	})
	if err == nil {
		return result.Thread.ID, nil
	}

	// "no rollout found" means the thread was created but never had a turn
	// sent on any connection. We must call thread/start (not resume) to get
	// a runnable rollout, using the same thread ID isn't possible — start a
	// fresh thread and let the caller's session record update naturally.
	if isNoRolloutFound(err) {
		s.logger.Printf("codex: no rollout for %s, starting fresh thread", input.SessionID)
		collaborationMode := buildCollaborationModeSelection(input.Agent, input.SystemPrompt)
		developerInstructions := emptyToNil(input.SystemPrompt)
		if collaborationMode != nil {
			developerInstructions = nil
		}
		fresh, startErr := conn.threadStart(ctx, threadStartParams{
			Model:                  modelToNil(input.Model),
			ModelProvider:          modelProviderToNil(input.Model),
			Cwd:                    emptyToNil(input.WorkingDir),
			ApprovalPolicy:         "on-request",
			ApprovalsReviewer:      "user",
			Sandbox:                "workspace-write",
			DeveloperInstructions:  developerInstructions,
			CollaborationMode:      collaborationMode,
			PersistExtendedHistory: true,
		})
		if startErr != nil {
			return "", fmt.Errorf("thread/start after no-rollout: %w", startErr)
		}
		return fresh.Thread.ID, nil
	}

	// Any other resume error — also fall back to a new thread.
	s.logger.Printf("codex: resume failed for %s (%v), starting replacement thread", input.SessionID, err)
	collaborationMode := buildCollaborationModeSelection(input.Agent, input.SystemPrompt)
	developerInstructions := emptyToNil(input.SystemPrompt)
	if collaborationMode != nil {
		developerInstructions = nil
	}
	fresh, startErr := conn.threadStart(ctx, threadStartParams{
		Model:                  modelToNil(input.Model),
		ModelProvider:          modelProviderToNil(input.Model),
		Cwd:                    emptyToNil(input.WorkingDir),
		ApprovalPolicy:         "on-request",
		ApprovalsReviewer:      "user",
		Sandbox:                "workspace-write",
		DeveloperInstructions:  developerInstructions,
		CollaborationMode:      collaborationMode,
		PersistExtendedHistory: true,
	})
	if startErr != nil {
		return "", fmt.Errorf("thread/start after resume failure: %w", startErr)
	}
	return fresh.Thread.ID, nil
}

func (s *sessionService) Abort(_ context.Context, sessionID string, _ string) (bool, error) {
	cancel, ok := s.active.get(sessionID)
	if !ok {
		return false, fmt.Errorf("session %q is not active", sessionID)
	}
	cancel()
	return true, nil
}

func buildUserInputs(prompt string, items []agent.InputItem) []userInput {
	inputs := []userInput{{
		Type:         "text",
		Text:         prompt,
		TextElements: []any{},
	}}

	for _, item := range items {
		kind := strings.TrimSpace(item.Type)
		if kind == "" {
			continue
		}
		inputs = append(inputs, userInput{
			Type: kind,
			Text: item.Text,
			Name: item.Name,
			Path: item.Path,
		})
	}

	return inputs
}

// ---------------------------------------------------------------------------
// appServerClient — manages connections to the codex app-server process
// ---------------------------------------------------------------------------

type appServerClient struct {
	command string
	cwd     string
	logger  *log.Logger
	handler acp.InteractionHandler

	// shared is a long-lived connection used for read-only calls (List, Get,
	// Messages). RunStream gets its own dedicated connection via newConn().
	sharedMu    sync.Mutex
	sharedConn_ *appServerConn
}

func newAppServerClient(command, cwd string, logger *log.Logger) *appServerClient {
	return &appServerClient{command: command, cwd: cwd, logger: logger}
}

// sharedConn returns (or lazily creates) the shared read-only connection.
func (c *appServerClient) sharedConn(ctx context.Context) (*appServerConn, error) {
	c.sharedMu.Lock()
	defer c.sharedMu.Unlock()

	if c.sharedConn_ != nil && c.sharedConn_.ctx.Err() == nil {
		return c.sharedConn_, nil
	}
	if c.sharedConn_ != nil {
		c.sharedConn_.close()
		c.sharedConn_ = nil
	}

	conn, err := c.dial(context.Background(), ctx)
	if err != nil {
		return nil, err
	}
	c.sharedConn_ = conn
	return conn, nil
}

// newConn creates a dedicated short-lived connection (used by RunStream).
func (c *appServerClient) newConn(ctx context.Context) (*appServerConn, error) {
	return c.dial(ctx, ctx)
}

func (c *appServerClient) closeShared() {
	c.sharedMu.Lock()
	defer c.sharedMu.Unlock()
	if c.sharedConn_ != nil {
		c.sharedConn_.close()
		c.sharedConn_ = nil
	}
}

// dial starts a new codex app-server process and performs the JSON-RPC
// handshake. lifetimeCtx controls the process lifetime; initCtx controls
// the initialize call timeout.
func (c *appServerClient) dial(lifetimeCtx, initCtx context.Context) (*appServerConn, error) {
	cmd := exec.CommandContext(lifetimeCtx, c.command, "app-server", "--listen", "stdio://")
	cmd.Dir = c.cwd
	cmd.Env = envWithExecutableDir(c.command)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start codex app-server: %w", err)
	}

	connCtx, cancel := context.WithCancel(lifetimeCtx)
	conn := &appServerConn{
		cmd:     cmd,
		ctx:     connCtx,
		cancel:  cancel,
		stdin:   stdin,
		pending: map[int64]chan responseEnvelope{},
		logger:  c.logger,
		handler: c.handler,
	}
	go conn.readStdout(stdout)
	go conn.readStderr(stderr)
	go conn.wait()

	var init initializeResponse
	if err := conn.call(initCtx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "relaid-go",
			"title":   "Relaid Go Server",
			"version": "0.0.1",
		},
		"capabilities": map[string]any{"experimentalApi": true},
	}, &init); err != nil {
		conn.close()
		return nil, fmt.Errorf("initialize: %w", err)
	}
	_ = conn.notify("initialized", nil)

	return conn, nil
}

func envWithExecutableDir(command string) []string {
	if !filepath.IsAbs(command) {
		return nil
	}

	dir := filepath.Dir(command)
	env := os.Environ()
	pathKey := "PATH="
	for i, item := range env {
		if strings.HasPrefix(item, pathKey) {
			env[i] = pathKey + dir + string(os.PathListSeparator) + strings.TrimPrefix(item, pathKey)
			return env
		}
	}
	return append(env, pathKey+dir)
}

// ---------------------------------------------------------------------------
// appServerConn — a single JSON-RPC connection to a codex app-server process
// ---------------------------------------------------------------------------

type appServerConn struct {
	cmd    *exec.Cmd
	ctx    context.Context
	cancel context.CancelFunc
	stdin  io.WriteCloser

	writeMu sync.Mutex

	pendingMu sync.Mutex
	pending   map[int64]chan responseEnvelope
	nextID    int64

	logger  *log.Logger
	handler acp.InteractionHandler

	notifMu sync.RWMutex
	notifFn func(serverNotification)
}

func (c *appServerConn) setNotificationHandler(fn func(serverNotification)) {
	c.notifMu.Lock()
	c.notifFn = fn
	c.notifMu.Unlock()
}

func (c *appServerConn) close() {
	c.cancel()
	c.writeMu.Lock()
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	c.writeMu.Unlock()
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
}

// High-level RPC helpers -------------------------------------------------------

func (c *appServerConn) threadStart(ctx context.Context, p threadStartParams) (*threadStartResponse, error) {
	var r threadStartResponse
	if err := c.call(ctx, "thread/start", p, &r); err != nil {
		return nil, err
	}
	c.logf("[thread-debug] thread created: %+v", r)
	return &r, nil
}

func (c *appServerConn) threadResume(ctx context.Context, p threadResumeParams) (*threadStartResponse, error) {
	var r threadStartResponse
	return &r, c.call(ctx, "thread/resume", p, &r)
}

func (c *appServerConn) threadList(ctx context.Context, p threadListParams) (*threadListResponse, error) {
	var r threadListResponse
	return &r, c.call(ctx, "thread/list", p, &r)
}

func (c *appServerConn) threadRead(ctx context.Context, threadID string, includeTurns bool) (*threadReadResponse, error) {
	var r threadReadResponse
	err := c.call(ctx, "thread/read", map[string]any{
		"threadId":     threadID,
		"includeTurns": includeTurns,
	}, &r)
	return &r, err
}

func (c *appServerConn) turnStart(ctx context.Context, p turnStartParams) (*turnStartResponse, error) {
	var r turnStartResponse
	return &r, c.call(ctx, "turn/start", p, &r)
}

func (c *appServerConn) turnInterrupt(ctx context.Context, threadID, turnID string) error {
	return c.call(ctx, "turn/interrupt", map[string]any{
		"threadId": threadID,
		"turnId":   turnID,
	}, nil)
}

func (c *appServerConn) modelList(ctx context.Context) (*modelListResponse, error) {
	var r modelListResponse
	return &r, c.call(ctx, "model/list", map[string]any{"includeHidden": false}, &r)
}

func (c *appServerConn) appList(ctx context.Context, p appListParams) (*appListResponse, error) {
	var r appListResponse
	return &r, c.call(ctx, "app/list", p, &r)
}

func (c *appServerConn) collaborationModeList(ctx context.Context) (*collaborationModeListResponse, error) {
	var r collaborationModeListResponse
	return &r, c.call(ctx, "collaborationMode/list", map[string]any{}, &r)
}

func (c *appServerConn) fuzzyFileSearch(ctx context.Context, p fuzzyFileSearchParams) (*fuzzyFileSearchResponse, error) {
	var r fuzzyFileSearchResponse
	return &r, c.call(ctx, "fuzzyFileSearch", p, &r)
}

// Low-level JSON-RPC -----------------------------------------------------------

func (c *appServerConn) call(ctx context.Context, method string, params any, out any) error {
	if ctx == nil {
		ctx = c.ctx
	}
	id := atomic.AddInt64(&c.nextID, 1)
	ch := make(chan responseEnvelope, 1)

	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()

	payload, err := json.Marshal(rpcRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	if err != nil {
		c.deletePending(id)
		return err
	}
	if err := c.writeMessage(payload); err != nil {
		c.deletePending(id)
		return err
	}

	select {
	case resp := <-ch:
		if resp.err != nil {
			return resp.err
		}
		if out == nil {
			return nil
		}
		return json.Unmarshal(resp.result, out)
	case <-ctx.Done():
		c.deletePending(id)
		return ctx.Err()
	case <-c.ctx.Done():
		c.deletePending(id)
		return c.ctx.Err()
	}
}

func (c *appServerConn) notify(method string, params any) error {
	payload, err := json.Marshal(rpcRequest{JSONRPC: "2.0", Method: method, Params: params})
	if err != nil {
		return err
	}
	return c.writeMessage(payload)
}

func (c *appServerConn) writeMessage(payload []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_, err := c.stdin.Write(append(payload, '\n'))
	return err
}

func (c *appServerConn) readStdout(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			c.logf("codex malformed stdout: %v", err)
			continue
		}

		_, hasMethod := raw["method"]
		_, hasID := raw["id"]

		switch {
		case hasMethod && hasID:
			c.handleServerRequest(raw["id"], raw["method"], raw["params"])
		case hasMethod:
			c.handleNotification(raw["method"], raw["params"])
		case hasID:
			var resp rpcResponse
			if err := json.Unmarshal(line, &resp); err != nil {
				continue
			}
			if resp.Error != nil {
				c.resolve(resp.ID, responseEnvelope{err: resp.Error})
			} else {
				c.resolve(resp.ID, responseEnvelope{result: resp.Result})
			}
		}
	}

	if err := scanner.Err(); err != nil {
		c.failAll(err)
		return
	}
	c.failAll(io.EOF)
}

func (c *appServerConn) handleNotification(rawMethod, rawParams json.RawMessage) {
	var method string
	if json.Unmarshal(rawMethod, &method) != nil {
		return
	}
	c.notifMu.RLock()
	fn := c.notifFn
	c.notifMu.RUnlock()
	if fn != nil {
		fn(serverNotification{Method: method, Params: rawParams})
	}
}

func (c *appServerConn) handleServerRequest(rawID, rawMethod, rawParams json.RawMessage) {
	var id int64
	var method string
	if json.Unmarshal(rawID, &id) != nil || json.Unmarshal(rawMethod, &method) != nil {
		return
	}
	switch method {
	case "item/commandExecution/requestApproval":
		go c.handleCommandApproval(id, rawParams)
	case "item/fileChange/requestApproval":
		go c.handleFileApproval(id, rawParams)
	case "item/permissions/requestApproval":
		go c.handlePermissionsApproval(id, rawParams)
	case "item/tool/requestUserInput":
		c.sendResult(id, map[string]any{"answers": map[string]any{}})
	default:
		c.sendError(id, &rpcError{Code: -32601, Message: "method not supported by client"})
	}
}

func (c *appServerConn) handleCommandApproval(id int64, rawParams json.RawMessage) {
	var req struct {
		ThreadID string  `json:"threadId"`
		ItemID   string  `json:"itemId"`
		Command  *string `json:"command"`
		Cwd      *string `json:"cwd"`
	}
	_ = json.Unmarshal(rawParams, &req)

	reply := c.requestPermission(acp.ACPPermissionRequest{
		SessionID: req.ThreadID,
		Method:    "item/commandExecution/requestApproval",
		Options: []acp.PermissionOption{
			{OptionID: "once", Kind: "allow_once", Name: "Allow once"},
			{OptionID: "always", Kind: "allow_always", Name: "Always allow"},
			{OptionID: "reject", Kind: "reject", Name: "Reject"},
		},
		ToolCall: &acp.ToolCallUpdate{
			ToolCallID: req.ItemID,
			Title:      stringPtrValue(req.Command, "Command execution"),
			Kind:       "execute",
			Locations:  []acp.ToolCallLocation{{Path: stringPtrValue(req.Cwd, "")}},
		},
		RawParams: rawParams,
	})
	c.sendResult(id, map[string]any{"decision": permissionDecision(reply)})
}

func (c *appServerConn) handleFileApproval(id int64, rawParams json.RawMessage) {
	var req struct {
		ThreadID  string  `json:"threadId"`
		ItemID    string  `json:"itemId"`
		GrantRoot *string `json:"grantRoot"`
		Reason    *string `json:"reason"`
	}
	_ = json.Unmarshal(rawParams, &req)

	reply := c.requestPermission(acp.ACPPermissionRequest{
		SessionID: req.ThreadID,
		Method:    "item/fileChange/requestApproval",
		Options: []acp.PermissionOption{
			{OptionID: "once", Kind: "allow_once", Name: "Allow once"},
			{OptionID: "always", Kind: "allow_always", Name: "Always allow"},
			{OptionID: "reject", Kind: "reject", Name: "Reject"},
		},
		ToolCall: &acp.ToolCallUpdate{
			ToolCallID: req.ItemID,
			Title:      stringPtrValue(req.Reason, "File change"),
			Kind:       "edit",
			Locations:  []acp.ToolCallLocation{{Path: stringPtrValue(req.GrantRoot, "*")}},
		},
		RawParams: rawParams,
	})
	c.sendResult(id, map[string]any{"decision": permissionDecision(reply)})
}

func (c *appServerConn) handlePermissionsApproval(id int64, rawParams json.RawMessage) {
	var req struct {
		ThreadID string  `json:"threadId"`
		ItemID   string  `json:"itemId"`
		Cwd      string  `json:"cwd"`
		Reason   *string `json:"reason"`
	}
	_ = json.Unmarshal(rawParams, &req)

	reply := c.requestPermission(acp.ACPPermissionRequest{
		SessionID: req.ThreadID,
		Method:    "item/permissions/requestApproval",
		Options: []acp.PermissionOption{
			{OptionID: "once", Kind: "allow_once", Name: "Allow once"},
			{OptionID: "always", Kind: "allow_always", Name: "Always allow"},
			{OptionID: "reject", Kind: "reject", Name: "Reject"},
		},
		ToolCall: &acp.ToolCallUpdate{
			ToolCallID: req.ItemID,
			Title:      stringPtrValue(req.Reason, "Permission request"),
			Kind:       "execute",
			Locations:  []acp.ToolCallLocation{{Path: req.Cwd}},
		},
		RawParams: rawParams,
	})

	if reply == "once" || reply == "always" {
		scope := "turn"
		if reply == "always" {
			scope = "session"
		}
		c.sendResult(id, map[string]any{"permissions": map[string]any{}, "scope": scope})
		return
	}
	c.sendError(id, &rpcError{Code: -32000, Message: "permission denied"})
}

func (c *appServerConn) requestPermission(req acp.ACPPermissionRequest) string {
	if c.handler == nil {
		return "reject"
	}
	ctx, cancel := context.WithTimeout(c.ctx, 120*time.Second)
	defer cancel()
	resp, err := c.handler.HandlePermission(ctx, req)
	if err != nil {
		c.logf("permission handler error: %v", err)
		return "reject"
	}
	switch resp.OptionID {
	case "once":
		return "once"
	case "always":
		return "always"
	default:
		return "reject"
	}
}

func permissionDecision(reply string) string {
	switch reply {
	case "once":
		return "accept"
	case "always":
		return "acceptForSession"
	default:
		return "decline"
	}
}

func (c *appServerConn) sendResult(id int64, result any) {
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
	_ = c.writeMessage(payload)
}

func (c *appServerConn) sendError(id int64, rpcErr *rpcError) {
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "error": rpcErr})
	_ = c.writeMessage(payload)
}

func (c *appServerConn) readStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		if line := strings.TrimSpace(scanner.Text()); line != "" {
			c.logf("codex stderr: %s", line)
		}
	}
}

func (c *appServerConn) wait() {
	err := c.cmd.Wait()
	if err != nil && c.ctx.Err() == nil {
		c.logf("codex app-server exited: %v", err)
	}
	c.cancel()
	c.failAll(fmt.Errorf("app-server process exited"))
}

func (c *appServerConn) resolve(id int64, resp responseEnvelope) {
	c.pendingMu.Lock()
	ch := c.pending[id]
	delete(c.pending, id)
	c.pendingMu.Unlock()
	if ch != nil {
		ch <- resp
	}
}

func (c *appServerConn) deletePending(id int64) {
	c.pendingMu.Lock()
	delete(c.pending, id)
	c.pendingMu.Unlock()
}

func (c *appServerConn) failAll(err error) {
	c.pendingMu.Lock()
	pending := c.pending
	c.pending = map[int64]chan responseEnvelope{}
	c.pendingMu.Unlock()
	for _, ch := range pending {
		ch <- responseEnvelope{err: err}
	}
}

func (c *appServerConn) logf(format string, args ...any) {
	if c.logger != nil {
		c.logger.Printf(format, args...)
	}
}

// ---------------------------------------------------------------------------
// activeRunStore
// ---------------------------------------------------------------------------

type activeRunStore struct {
	mu   sync.Mutex
	runs map[string]context.CancelFunc
}

func (s *activeRunStore) set(id string, cancel context.CancelFunc) {
	s.mu.Lock()
	s.runs[id] = cancel
	s.mu.Unlock()
}

func (s *activeRunStore) delete(id string) {
	s.mu.Lock()
	delete(s.runs, id)
	s.mu.Unlock()
}

func (s *activeRunStore) get(id string) (context.CancelFunc, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cancel, ok := s.runs[id]
	return cancel, ok
}

func (s *activeRunStore) has(id string) bool {
	s.mu.Lock()
	_, ok := s.runs[id]
	s.mu.Unlock()
	return ok
}

// ---------------------------------------------------------------------------
// Message mapping
// ---------------------------------------------------------------------------

func mapCodexMessages(sessionID string, turns []turn) []agent.SessionMessagesResponse {
	envelopes := make([]agent.SessionMessagesResponse, 0, len(turns)*2)
	for turnIdx, t := range turns {
		createdAt := codexTurnMillis(t.StartedAt)
		completedAt := codexTurnCompletedMillis(t.CompletedAt)
		assistantMsgID := nonEmptyID(t.ID, fmt.Sprintf("turn_%d", turnIdx)) + "_assistant"
		assistantParts := make([]opencode.Part, 0)

		for itemIdx, raw := range t.Items {
			item := decodeItem(raw)
			itemType := itemString(item, "type")
			itemID := itemString(item, "id")
			if itemID == "" {
				itemID = fmt.Sprintf("%s_item_%d", nonEmptyID(t.ID, "turn"), itemIdx)
			}

			switch itemType {
			case "userMessage":
				text := userMessageText(item)
				if text == "" {
					continue
				}
				envelopes = append(envelopes, agent.SessionMessagesResponse{
					Info: messageInfo(itemID, sessionID, "user", createdAt, nil),
					Parts: []opencode.Part{
						textPart(itemID+"_text", itemID, sessionID, text, createdAt),
					},
				})

			case "agentMessage":
				if text := itemString(item, "text"); text != "" {
					assistantParts = append(assistantParts, textPart(itemID, assistantMsgID, sessionID, text, createdAt))
				}

			case "reasoning":
				if text := reasoningText(item); text != "" {
					assistantParts = append(assistantParts, reasoningPart(itemID, assistantMsgID, sessionID, text, createdAt))
				}

			case "plan":
				if text := itemString(item, "text"); text != "" {
					assistantParts = append(assistantParts, reasoningPart(itemID, assistantMsgID, sessionID, text, createdAt))
				}

			default:
				if part, ok := toolPart(itemID, assistantMsgID, sessionID, itemType, item, createdAt, completedAt); ok {
					assistantParts = append(assistantParts, part)
				}
			}
		}

		if len(assistantParts) > 0 {
			envelopes = append(envelopes, agent.SessionMessagesResponse{
				Info:  messageInfo(assistantMsgID, sessionID, "assistant", createdAt, completedAt),
				Parts: assistantParts,
			})
		}
	}
	return envelopes
}

func decodeItem(raw json.RawMessage) map[string]any {
	var item map[string]any
	_ = json.Unmarshal(raw, &item)
	if item == nil {
		return map[string]any{}
	}
	return item
}

func messageInfo(id, sessionID, role string, createdAt int64, completedAt *int64) json.RawMessage {
	timeInfo := map[string]any{"created": createdAt}
	if completedAt != nil {
		timeInfo["completed"] = *completedAt
	}
	info := map[string]any{
		"id":        id,
		"sessionID": sessionID,
		"role":      role,
		"time":      timeInfo,
	}
	if role == "assistant" {
		info["mode"] = "codex"
		info["modelID"] = "codex"
		info["providerID"] = "openai"
		info["cost"] = 0
		info["tokens"] = map[string]any{
			"input": 0, "output": 0, "reasoning": 0,
			"cache": map[string]any{"read": 0, "write": 0},
		}
	}
	raw, err := json.Marshal(info)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return raw
}

func textPart(id, messageID, sessionID, text string, createdAt int64) opencode.Part {
	return opencode.Part{
		ID: id, MessageID: messageID, SessionID: sessionID,
		Type: opencode.PartTypeText, Text: text,
		Time: map[string]float64{"start": float64(createdAt)},
	}
}

func reasoningPart(id, messageID, sessionID, text string, createdAt int64) opencode.Part {
	return opencode.Part{
		ID: id, MessageID: messageID, SessionID: sessionID,
		Type: opencode.PartTypeReasoning, Text: text,
		Time: map[string]float64{"start": float64(createdAt)},
	}
}

func toolPart(id, messageID, sessionID, itemType string, item map[string]any, createdAt int64, completedAt *int64) (opencode.Part, bool) {
	tool := toolName(itemType, item)
	if tool == "" {
		return opencode.Part{}, false
	}

	status := "completed"
	if s := statusString(item["status"]); s != "" {
		status = s
	}

	timeMap := map[string]float64{"start": float64(createdAt)}
	if completedAt != nil {
		timeMap["end"] = float64(*completedAt)
	}

	state := map[string]any{
		"status":   status,
		"title":    toolTitle(itemType, item, tool),
		"input":    toolInput(itemType, item),
		"metadata": toolMetadata(itemType, item),
		"time":     timeMap,
	}
	if output := toolOutput(item); output != "" {
		state["output"] = output
		if strings.Contains(strings.ToLower(status), "fail") || strings.Contains(strings.ToLower(status), "error") {
			state["error"] = output
		}
	}

	return opencode.Part{
		ID: id, MessageID: messageID, SessionID: sessionID,
		Type: opencode.PartTypeTool, Tool: tool, State: state,
	}, true
}

func userMessageText(item map[string]any) string {
	content, ok := item["content"].([]any)
	if !ok {
		return itemString(item, "text")
	}
	parts := make([]string, 0, len(content))
	for _, entry := range content {
		rec, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		switch itemString(rec, "type") {
		case "text":
			if t := itemString(rec, "text"); t != "" {
				parts = append(parts, t)
			}
		case "image":
			if u := itemString(rec, "url"); u != "" {
				parts = append(parts, u)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n\n"))
}

func reasoningText(item map[string]any) string {
	parts := append(stringSlice(item["summary"]), stringSlice(item["content"])...)
	return strings.TrimSpace(strings.Join(parts, "\n\n"))
}

func toolName(itemType string, item map[string]any) string {
	switch itemType {
	case "commandExecution":
		return "shell"
	case "fileChange":
		return "edit"
	case "mcpToolCall", "dynamicToolCall", "collabAgentToolCall":
		if t := itemString(item, "tool"); t != "" {
			return strings.ToLower(t)
		}
	case "webSearch":
		return "websearch"
	case "imageView":
		return "read"
	case "imageGeneration":
		return "image_generation"
	case "contextCompaction":
		return "compact"
	case "enteredReviewMode", "exitedReviewMode":
		return "review"
	}
	return strings.TrimSpace(itemType)
}

func toolTitle(itemType string, item map[string]any, tool string) string {
	switch itemType {
	case "commandExecution":
		if cmd := itemString(item, "command"); cmd != "" {
			return cmd
		}
		return "Shell"
	case "fileChange":
		return "Edit files"
	case "webSearch":
		if q := itemString(item, "query"); q != "" {
			return q
		}
		return "Search"
	}
	return tool
}

func toolInput(itemType string, item map[string]any) map[string]any {
	input := map[string]any{}
	switch itemType {
	case "commandExecution":
		input["command"] = itemString(item, "command")
		input["cwd"] = itemString(item, "cwd")
	case "fileChange":
		input["changes"] = item["changes"]
	case "mcpToolCall":
		input["server"] = itemString(item, "server")
		input["arguments"] = item["arguments"]
	case "dynamicToolCall":
		input["namespace"] = itemString(item, "namespace")
		input["arguments"] = item["arguments"]
	case "webSearch":
		input["query"] = itemString(item, "query")
	default:
		for _, key := range []string{"query", "path", "url", "prompt"} {
			if v := itemString(item, key); v != "" {
				input[key] = v
			}
		}
	}
	return input
}

func toolMetadata(itemType string, item map[string]any) map[string]any {
	meta := map[string]any{"codexType": itemType}
	for _, key := range []string{"durationMs", "exitCode", "cwd", "server", "namespace", "success", "changes"} {
		if v, ok := item[key]; ok && v != nil {
			meta[key] = v
		}
	}
	return meta
}

func toolOutput(item map[string]any) string {
	if s := itemString(item, "aggregatedOutput"); s != "" {
		return s
	}
	for _, key := range []string{"result", "contentItems", "error"} {
		if v, ok := item[key]; ok && v != nil {
			if raw, err := json.Marshal(v); err == nil && string(raw) != "null" {
				return string(raw)
			}
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

func itemString(item map[string]any, key string) string {
	v, ok := item[key]
	if !ok || v == nil {
		return ""
	}
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

func statusString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	if m, ok := v.(map[string]any); ok {
		if s := itemString(m, "type"); s != "" {
			return s
		}
		return itemString(m, "status")
	}
	return ""
}

func stringSlice(v any) []string {
	if raw, ok := v.([]any); ok {
		result := make([]string, 0, len(raw))
		for _, entry := range raw {
			if s, ok := entry.(string); ok && strings.TrimSpace(s) != "" {
				result = append(result, strings.TrimSpace(s))
			}
		}
		return result
	}
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		return []string{strings.TrimSpace(s)}
	}
	return nil
}

func codexTurnMillis(v *int64) int64 {
	if v == nil || *v <= 0 {
		return time.Now().UnixMilli()
	}
	return *v * 1000
}

func codexTurnCompletedMillis(v *int64) *int64 {
	if v == nil || *v <= 0 {
		return nil
	}
	ms := *v * 1000
	return &ms
}

func nonEmptyID(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func buildCollaborationModeSelection(agentName, developerInstructions string) *collaborationModeSelection {
	mode := normalizeCollaborationMode(agentName)
	if mode == "" {
		return nil
	}

	settings := map[string]any{
		"developer_instructions": nil,
	}
	if instructions := strings.TrimSpace(developerInstructions); instructions != "" {
		settings["developer_instructions"] = instructions
	}

	return &collaborationModeSelection{
		Mode:     mode,
		Settings: settings,
	}
}

func normalizeCollaborationMode(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return ""
	}

	replacer := strings.NewReplacer(" ", "_", "-", "_")
	normalized = replacer.Replace(normalized)

	switch normalized {
	case "plan", "default":
		return normalized
	}

	return normalized
}

func collaborationModeDisplayName(mode string) string {
	switch normalizeCollaborationMode(mode) {
	case "plan":
		return "Plan"
	case "default":
		return "Default"
	default:
		return strings.TrimSpace(mode)
	}
}

func collaborationModeDescription(mode codexCollaborationMode) string {
	parts := make([]string, 0, 2)
	if effort := stringPtrValue(mode.ReasoningEffort, ""); effort != "" {
		parts = append(parts, fmt.Sprintf("Reasoning: %s", effort))
	}
	if model := stringPtrValue(mode.Model, ""); model != "" {
		parts = append(parts, fmt.Sprintf("Model: %s", model))
	}
	if len(parts) == 0 {
		return fmt.Sprintf("Codex collaboration mode: %s", normalizeCollaborationMode(mode.Mode))
	}
	return strings.Join(parts, " | ")
}

func codexItemLabel(raw json.RawMessage) string {
	var env struct {
		Item struct {
			Type    string `json:"type"`
			Command string `json:"command"`
			Tool    string `json:"tool"`
		} `json:"item"`
	}
	if json.Unmarshal(raw, &env) != nil {
		return ""
	}
	switch env.Item.Type {
	case "commandExecution":
		if env.Item.Command != "" {
			return env.Item.Command
		}
		return "Running command"
	case "fileChange":
		return "Editing files"
	case "mcpToolCall":
		if env.Item.Tool != "" {
			return env.Item.Tool
		}
		return "Using MCP tool"
	}
	return ""
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
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) <= timeout {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, timeout)
}

func unixSeconds(v int64) time.Time {
	if v <= 0 {
		return time.Now().UTC()
	}
	return time.Unix(v, 0).UTC()
}

func emptyToNil(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

func positiveToNil(v int) *int {
	if v <= 0 {
		return nil
	}
	return &v
}

func cwdParam(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

func stringValue(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func stringPtrValue(v *string, fallback string) string {
	if v == nil || *v == "" {
		return fallback
	}
	return *v
}

func ptr(v string) *string { return &v }

func modelToNil(m *agent.ModelRef) *string {
	if m == nil {
		return nil
	}
	return emptyToNil(m.ModelID)
}

func modelProviderToNil(m *agent.ModelRef) *string {
	if m == nil || strings.TrimSpace(m.ProviderID) == "" {
		return ptr("openai")
	}
	return emptyToNil(m.ProviderID)
}

func isNoRolloutFound(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "no rollout found")
}

func isThreadNotLoaded(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "thread not loaded")
}

func isTurnsUnavailable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "includeturns is unavailable before first user message") ||
		(strings.Contains(msg, "not materialized yet") && strings.Contains(msg, "includeturns"))
}

func mapThread(t thread) agent.Session {
	title := firstNonEmpty(stringPtrValue(t.Name, ""), t.Preview, "Untitled Codex thread")
	return agent.Session{
		ID:        t.ID,
		Directory: t.Cwd,
		Title:     title,
		Status:    mapThreadStatus(t.Status),
		CreatedAt: unixSeconds(t.CreatedAt),
		UpdatedAt: unixSeconds(t.UpdatedAt),
	}
}

func mapThreadStatus(raw json.RawMessage) agent.SessionState {
	var status struct {
		Type string `json:"type"`
	}
	if len(raw) > 0 && json.Unmarshal(raw, &status) == nil {
		switch status.Type {
		case "active":
			return agent.SessionRunning
		case "systemError":
			return agent.SessionFailed
		case "idle", "notLoaded":
			return agent.SessionCompleted
		}
	}
	return agent.SessionCompleted
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

type initializeResponse struct {
	UserAgent string `json:"userAgent"`
}

type threadStartParams struct {
	Model                  *string                     `json:"model,omitempty"`
	ModelProvider          *string                     `json:"modelProvider,omitempty"`
	Cwd                    *string                     `json:"cwd,omitempty"`
	ApprovalPolicy         string                      `json:"approvalPolicy,omitempty"`
	ApprovalsReviewer      string                      `json:"approvalsReviewer,omitempty"`
	Sandbox                string                      `json:"sandbox,omitempty"`
	DeveloperInstructions  *string                     `json:"developerInstructions,omitempty"`
	CollaborationMode      *collaborationModeSelection `json:"collaborationMode,omitempty"`
	ExperimentalRawEvents  bool                        `json:"experimentalRawEvents"`
	PersistExtendedHistory bool                        `json:"persistExtendedHistory"`
}

type threadResumeParams struct {
	ThreadID               string                      `json:"threadId"`
	Model                  *string                     `json:"model,omitempty"`
	ModelProvider          *string                     `json:"modelProvider,omitempty"`
	Cwd                    *string                     `json:"cwd,omitempty"`
	ApprovalPolicy         string                      `json:"approvalPolicy,omitempty"`
	ApprovalsReviewer      string                      `json:"approvalsReviewer,omitempty"`
	Sandbox                string                      `json:"sandbox,omitempty"`
	CollaborationMode      *collaborationModeSelection `json:"collaborationMode,omitempty"`
	ExcludeTurns           bool                        `json:"excludeTurns,omitempty"`
	PersistExtendedHistory bool                        `json:"persistExtendedHistory"`
}

type threadListParams struct {
	Cursor         *string  `json:"cursor,omitempty"`
	Limit          *int     `json:"limit,omitempty"`
	ModelProviders []string `json:"modelProviders,omitempty"`
	Cwd            any      `json:"cwd,omitempty"`
}

type appListParams struct {
	ThreadID     *string `json:"threadId,omitempty"`
	Cursor       *string `json:"cursor,omitempty"`
	Limit        *int    `json:"limit,omitempty"`
	ForceRefetch bool    `json:"forceRefetch"`
}

type fuzzyFileSearchParams struct {
	Query string   `json:"query"`
	Roots []string `json:"roots"`
}

type turnStartParams struct {
	ThreadID string      `json:"threadId"`
	Input    []userInput `json:"input"`
	Cwd      *string     `json:"cwd,omitempty"`
	Model    *string     `json:"model,omitempty"`
}

type userInput struct {
	Type         string `json:"type"`
	Text         string `json:"text,omitempty"`
	Name         string `json:"name,omitempty"`
	Path         string `json:"path,omitempty"`
	TextElements []any  `json:"text_elements,omitempty"`
}

type threadStartResponse struct {
	Thread thread `json:"thread"`
}
type threadListResponse struct {
	Data       []thread `json:"data"`
	NextCursor *string  `json:"nextCursor"`
}
type threadReadResponse struct {
	Thread thread `json:"thread"`
}
type turnStartResponse struct {
	Turn turn `json:"turn"`
}
type modelListResponse struct {
	Data       []codexModel `json:"data"`
	NextCursor *string      `json:"nextCursor"`
}

type collaborationModeListResponse struct {
	Data []codexCollaborationMode `json:"data"`
}

type appListResponse struct {
	Data       []codexApp `json:"data"`
	NextCursor *string    `json:"nextCursor"`
}

type fuzzyFileSearchResponse struct {
	Files []fuzzyFileSearchResult `json:"files"`
}

type fuzzyFileSearchResult struct {
	Root      string `json:"root"`
	Path      string `json:"path"`
	MatchType string `json:"match_type"`
	FileName  string `json:"file_name"`
}

type codexModel struct {
	ID          string `json:"id"`
	Model       string `json:"model"`
	DisplayName string `json:"displayName"`
	Hidden      bool   `json:"hidden"`
}

type codexCollaborationMode struct {
	Name            string  `json:"name"`
	Mode            string  `json:"mode"`
	Model           *string `json:"model"`
	ReasoningEffort *string `json:"reasoning_effort"`
}

type collaborationModeSelection struct {
	Mode     string         `json:"mode"`
	Settings map[string]any `json:"settings,omitempty"`
}

type codexApp struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	IsAccessible bool   `json:"isAccessible"`
	IsEnabled    bool   `json:"isEnabled"`
	Labels       any    `json:"labels"`
}

type thread struct {
	ID            string          `json:"id"`
	Preview       string          `json:"preview"`
	ModelProvider string          `json:"modelProvider"`
	CreatedAt     int64           `json:"createdAt"`
	UpdatedAt     int64           `json:"updatedAt"`
	Status        json.RawMessage `json:"status"`
	Cwd           string          `json:"cwd"`
	Name          *string         `json:"name"`
	Turns         []turn          `json:"turns"`
}

type turn struct {
	ID          string            `json:"id"`
	Items       []json.RawMessage `json:"items"`
	Status      any               `json:"status"`
	Error       any               `json:"error"`
	StartedAt   *int64            `json:"startedAt"`
	CompletedAt *int64            `json:"completedAt"`
	DurationMs  *int64            `json:"durationMs"`
}

func (t turn) errorMessage() string {
	if t.Error == nil {
		return "Codex turn failed."
	}
	raw, err := json.Marshal(t.Error)
	if err != nil {
		return "Codex turn failed."
	}
	return string(raw)
}

type serverNotification struct {
	Method string
	Params json.RawMessage
}

type turnCompletion struct {
	turn turn
	err  error
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
