package sdk

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	opencode "github.com/sst/opencode-sdk-go"
	"github.com/sst/opencode-sdk-go/option"

	"relaid/internal/agent"
)

type Adapter struct {
	mu        sync.Mutex
	client    *opencode.Client
	http      *httpClient
	baseURL   string
	cwd       string
	lazySetup func(context.Context) (string, error)
}

func New(baseURL, cwd string) *Adapter {
	return &Adapter{
		client:  newSDKClient(baseURL),
		http:    newHTTPClient(baseURL),
		baseURL: baseURL,
		cwd:     cwd,
	}
}

func NewLazy(cwd string, resolveURL func(context.Context) (string, error)) *Adapter {
	return &Adapter{
		cwd:       cwd,
		lazySetup: resolveURL,
	}
}

func (a *Adapter) Cwd() string {
	return a.cwd
}

func newSDKClient(baseURL string) *opencode.Client {
	opts := []option.RequestOption{
		option.WithMaxRetries(0),
		option.WithRequestTimeout(20 * time.Second),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	return opencode.NewClient(opts...)
}

func (a *Adapter) ensureClient(ctx context.Context) (*opencode.Client, *httpClient, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.lazySetup == nil {
		if a.client == nil || a.http == nil {
			return nil, nil, fmt.Errorf("opencode SDK client not configured")
		}
		return a.client, a.http, nil
	}

	baseURL, err := a.lazySetup(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("start opencode server: %w", err)
	}

	if a.client == nil || a.http == nil || a.baseURL != baseURL {
		a.client = newSDKClient(baseURL)
		a.http = newHTTPClient(baseURL)
		a.baseURL = baseURL
	}

	return a.client, a.http, nil
}

func (a *Adapter) ListProjects(ctx context.Context) ([]agent.Project, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}
	projects, err := client.Project.List(ctx, opencode.ProjectListParams{
		Directory: opencode.F(a.cwd),
	})
	if err != nil {
		return nil, err
	}

	result := make([]agent.Project, 0, len(*projects))
	for _, project := range *projects {
		result = append(result, mapProject(project))
	}
	return result, nil
}

func (a *Adapter) GetProject(ctx context.Context, projectID string) (*agent.Project, error) {
	projects, err := a.ListProjects(ctx)
	if err != nil {
		return nil, err
	}
	for _, project := range projects {
		if project.ID == projectID {
			copy := project
			return &copy, nil
		}
	}
	return nil, nil
}

func (a *Adapter) GetSession(ctx context.Context, sessionID string) (*agent.Session, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}
	session, err := client.Session.Get(ctx, sessionID, opencode.SessionGetParams{})
	if err != nil {
		return nil, err
	}
	value := mapSession(*session)
	return &value, nil
}

func (a *Adapter) GetSessionMessages(ctx context.Context, sessionID string, limit int) ([]agent.SessionMessagesResponse, error) {
	_, httpClient, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}

	session, err := a.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return []agent.SessionMessagesResponse{}, nil
	}

	messages, err := httpClient.GetSessionMessages(ctx, sessionID, session.Directory, limit)
	if err != nil {
		return nil, err
	}
	result := make([]agent.SessionMessagesResponse, len(messages))
	for i, m := range messages {
		result[i] = agent.SessionMessagesResponse{
			Info:  m.Info,
			Parts: m.Parts,
		}
	}
	return result, nil
}

func (a *Adapter) GetSessionDiff(ctx context.Context, sessionID, messageID string) ([]agent.FileDiff, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}
	session, err := a.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return []agent.FileDiff{}, nil
	}

	query := url.Values{}
	query.Set("directory", session.Directory)
	if messageID != "" {
		query.Set("messageID", messageID)
	}

	var diffs []struct {
		File      string `json:"file"`
		Before    string `json:"before"`
		After     string `json:"after"`
		Additions int    `json:"additions"`
		Deletions int    `json:"deletions"`
		Patch     string `json:"patch"`
	}
	if err := client.Get(ctx, "session/"+sessionID+"/diff?"+query.Encode(), nil, &diffs); err != nil {
		return nil, err
	}

	result := make([]agent.FileDiff, 0, len(diffs))
	for _, diff := range diffs {
		result = append(result, agent.FileDiff{
			File:      diff.File,
			Before:    diff.Before,
			After:     diff.After,
			Additions: diff.Additions,
			Deletions: diff.Deletions,
			Patch:     diff.Patch,
		})
	}
	return result, nil
}

func (a *Adapter) ListProviders(ctx context.Context) ([]agent.Provider, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}
	response, err := client.App.Providers(ctx, opencode.AppProvidersParams{
		Directory: opencode.F(a.cwd),
	})
	if err != nil {
		return nil, err
	}

	providers := make([]agent.Provider, 0, len(response.Providers))
	for _, provider := range response.Providers {
		models := make([]agent.Model, 0, len(provider.Models))
		keys := make([]string, 0, len(provider.Models))
		for key := range provider.Models {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		for _, key := range keys {
			model := provider.Models[key]
			models = append(models, agent.Model{
				ID:   model.ID,
				Name: model.Name,
			})
		}

		providers = append(providers, agent.Provider{
			ID:     provider.ID,
			Name:   provider.Name,
			Models: models,
		})
	}

	return providers, nil
}

func (a *Adapter) ListAgents(ctx context.Context, directory string) ([]agent.AgentConfig, error) {
	_, httpClient, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}

	query := url.Values{}
	if directory != "" {
		query.Set("directory", directory)
	}

	var response []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Mode        string          `json:"mode"`
		BuiltIn     bool            `json:"builtIn"`
		Hidden      bool            `json:"hidden"`
		Tools       map[string]bool `json:"tools"`
		Prompt      string          `json:"prompt"`
		Model       *struct {
			ProviderID string `json:"providerID"`
			ModelID    string `json:"modelID"`
		} `json:"model"`
	}
	if err := httpClient.get(ctx, "agent", query, &response); err != nil {
		return nil, err
	}

	log.Printf("[skills-debug] ListAgents: directory=%q agents_count=%d", directory, len(response))
	for i, item := range response {
		toolNames := make([]string, 0, len(item.Tools))
		for k, v := range item.Tools {
			if v {
				toolNames = append(toolNames, k)
			}
		}
		sort.Strings(toolNames)
		log.Printf("[skills-debug] agent[%d]: name=%q mode=%q builtIn=%v hidden=%v tools=%v prompt_len=%d", i, item.Name, item.Mode, item.BuiltIn, item.Hidden, toolNames, len(item.Prompt))
	}

	result := make([]agent.AgentConfig, 0, len(response))
	for _, item := range response {
		var model *agent.ModelRef
		if item.Model != nil {
			model = &agent.ModelRef{
				ProviderID: item.Model.ProviderID,
				ModelID:    item.Model.ModelID,
			}
		}
		result = append(result, agent.AgentConfig{
			Name:        item.Name,
			Description: item.Description,
			Mode:        item.Mode,
			BuiltIn:     item.BuiltIn,
			Hidden:      item.Hidden,
			Model:       model,
		})
	}

	return result, nil
}

func mapProject(project opencode.Project) agent.Project {
	created := agent.MillisToTime(int64(project.Time.Created))
	var initialized *time.Time
	if project.Time.Initialized > 0 {
		value := agent.MillisToTime(int64(project.Time.Initialized))
		initialized = &value
	}
	return agent.Project{
		ID:          project.ID,
		Worktree:    project.Worktree,
		VCS:         string(project.Vcs),
		CreatedAt:   created,
		Initialized: initialized,
	}
}

func mapSession(session opencode.Session) agent.Session {
	value := agent.Session{
		ID:        session.ID,
		ProjectID: session.ProjectID,
		Directory: session.Directory,
		ParentID:  session.ParentID,
		Title:     session.Title,
		Version:   session.Version,
		Status:    agent.SessionCompleted,
		CreatedAt: agent.MillisToTime(int64(session.Time.Created)),
		UpdatedAt: agent.MillisToTime(int64(session.Time.Updated)),
	}

	if session.Share.URL != "" {
		value.ShareURL = session.Share.URL
	}

	if len(session.Summary.Diffs) > 0 {
		summary := &agent.SessionSummary{
			Diffs: make([]agent.FileDiff, 0, len(session.Summary.Diffs)),
			Files: len(session.Summary.Diffs),
		}
		for _, diff := range session.Summary.Diffs {
			summary.Additions += int(diff.Additions)
			summary.Deletions += int(diff.Deletions)
			summary.Diffs = append(summary.Diffs, agent.FileDiff{
				File:      diff.File,
				Before:    diff.Before,
				After:     diff.After,
				Additions: int(diff.Additions),
				Deletions: int(diff.Deletions),
			})
		}
		value.Summary = summary
	}

	return value
}

func (a *Adapter) ListSessions(ctx context.Context, directory string) ([]agent.Session, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}

	params := opencode.SessionListParams{}
	if directory != "" {
		params.Directory = opencode.F(directory)
	}

	sessions, err := client.Session.List(ctx, params)
	if err != nil {
		return nil, err
	}

	result := make([]agent.Session, 0, len(*sessions))
	for _, session := range *sessions {
		result = append(result, mapSession(session))
	}
	return result, nil
}

func (a *Adapter) ResolveProjectByDirectory(ctx context.Context, directory string) (string, error) {
	projects, err := a.ListProjects(ctx)
	if err != nil {
		return "", err
	}
	for _, project := range projects {
		if project.Worktree == directory {
			return project.ID, nil
		}
	}
	return "", nil
}

func (a *Adapter) EnsureProjectDirectory(ctx context.Context, projectID, workingDir string) (string, error) {
	if workingDir != "" {
		return workingDir, nil
	}
	if projectID == "" {
		if a.cwd == "" {
			return "", fmt.Errorf("workingDir or projectId is required")
		}
		return a.cwd, nil
	}
	project, err := a.GetProject(ctx, projectID)
	if err != nil {
		return "", err
	}
	if project == nil {
		return "", fmt.Errorf("project %q not found", projectID)
	}
	return project.Worktree, nil
}

func (a *Adapter) SearchFiles(ctx context.Context, projectID string, query string, limit int) ([]agent.FileMatch, error) {
	client, _, err := a.ensureClient(ctx)
	if err != nil {
		return nil, err
	}

	worktree, err := a.EnsureProjectDirectory(ctx, projectID, "")
	if err != nil {
		return nil, err
	}

	params := opencode.FindFilesParams{
		Query:     opencode.F(query),
		Directory: opencode.F(worktree),
	}

	paths, err := client.Find.Files(ctx, params)
	if err != nil {
		return nil, err
	}

	results := make([]agent.FileMatch, 0, len(*paths))
	for _, p := range *paths {
		if limit > 0 && len(results) >= limit {
			break
		}

		absPath := p
		if !filepath.IsAbs(p) {
			absPath = filepath.Join(worktree, p)
		}

		fileType := "file"
		if info, err := os.Stat(absPath); err == nil && info.IsDir() {
			fileType = "directory"
		}

		results = append(results, agent.FileMatch{
			Name: filepath.Base(p),
			Path: p,
			Type: fileType,
		})
	}

	return results, nil
}
