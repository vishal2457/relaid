package sdk

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"sync"
	"time"

	opencode "github.com/sst/opencode-sdk-go"
	"github.com/sst/opencode-sdk-go/option"

	"relaid/internal/agent"
)

type Adapter struct {
	client    *opencode.Client
	cwd       string
	lazySetup func() (string, error)
	initOnce  sync.Once
	initErr   error
}

func New(baseURL, cwd string) *Adapter {
	opts := []option.RequestOption{}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}

	return &Adapter{
		client: opencode.NewClient(opts...),
		cwd:    cwd,
	}
}

func NewLazy(cwd string, resolveURL func() (string, error)) *Adapter {
	return &Adapter{
		cwd:       cwd,
		lazySetup: resolveURL,
	}
}

func (a *Adapter) ensureClient() error {
	if a.client != nil {
		return nil
	}
	if a.lazySetup == nil {
		return fmt.Errorf("opencode SDK client not configured")
	}
	a.initOnce.Do(func() {
		baseURL, err := a.lazySetup()
		if err != nil {
			a.initErr = fmt.Errorf("start opencode server: %w", err)
			return
		}
		opts := []option.RequestOption{option.WithBaseURL(baseURL)}
		a.client = opencode.NewClient(opts...)
	})
	return a.initErr
}

func (a *Adapter) ListProjects(ctx context.Context) ([]agent.Project, error) {
	if err := a.ensureClient(); err != nil {
		return nil, err
	}
	projects, err := a.client.Project.List(ctx, opencode.ProjectListParams{
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
	if err := a.ensureClient(); err != nil {
		return nil, err
	}
	session, err := a.client.Session.Get(ctx, sessionID, opencode.SessionGetParams{})
	if err != nil {
		return nil, err
	}
	value := mapSession(*session)
	return &value, nil
}

func (a *Adapter) GetSessionMessages(ctx context.Context, sessionID string, limit int) ([]agent.MessageEnvelope, error) {
	if err := a.ensureClient(); err != nil {
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
		return []agent.MessageEnvelope{}, nil
	}

	messages, err := a.client.Session.Messages(ctx, sessionID, opencode.SessionMessagesParams{
		Directory: opencode.F(session.Directory),
	})
	if err != nil {
		return nil, err
	}

	items := *messages
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}

	result := make([]agent.MessageEnvelope, 0, len(items))
	for _, item := range items {
		infoJSON, err := json.Marshal(item.Info)
		if err != nil {
			return nil, err
		}

		parts := make([]json.RawMessage, 0, len(item.Parts))
		for _, part := range item.Parts {
			partJSON, err := json.Marshal(part)
			if err != nil {
				return nil, err
			}
			parts = append(parts, partJSON)
		}

		result = append(result, agent.MessageEnvelope{
			Info:  infoJSON,
			Parts: parts,
		})
	}
	return result, nil
}

func (a *Adapter) GetSessionDiff(ctx context.Context, sessionID, messageID string) ([]agent.FileDiff, error) {
	if err := a.ensureClient(); err != nil {
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
	if err := a.client.Get(ctx, "session/"+sessionID+"/diff?"+query.Encode(), nil, &diffs); err != nil {
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
	if err := a.ensureClient(); err != nil {
		return nil, err
	}
	response, err := a.client.App.Providers(ctx, opencode.AppProvidersParams{
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
	if err := a.ensureClient(); err != nil {
		return nil, err
	}

	params := opencode.SessionListParams{}
	if directory != "" {
		params.Directory = opencode.F(directory)
	}

	sessions, err := a.client.Session.List(ctx, params)
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
