package workspace

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"relaid/internal/agent"
	"relaid/internal/db/sqlc"

	_ "modernc.org/sqlite"
)

type Service struct {
	queries *sqlc.Queries
}

type Workspace struct {
	ID                string
	Key               string
	Name              string
	Directory         string
	Description       string
	OpencodeProjectID string
	CodexWorkspaceID  string
	ClaudeWorkspaceID string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type CreateInput struct {
	Name        string
	Directory   string
	Description string
}

type SyncInput struct {
	Name              string
	Directory         string
	Description       string
	OpencodeProjectID string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func NewService(queries *sqlc.Queries) *Service {
	return &Service{queries: queries}
}

func EncodeKey(directory string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(directory))
}

func DecodeKey(value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("workspace key is required")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err == nil {
		return string(decoded), nil
	}
	return value, nil
}

func (s *Service) List(ctx context.Context) ([]Workspace, error) {
	rows, err := s.queries.ListWorkspaces(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]Workspace, 0, len(rows))
	for _, row := range rows {
		result = append(result, mapWorkspace(row))
	}
	return result, nil
}

func (s *Service) GetByDirectory(ctx context.Context, directory string) (*Workspace, error) {
	row, err := s.queries.GetWorkspaceByDirectory(ctx, directory)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	workspace := mapWorkspace(row)
	return &workspace, nil
}

func (s *Service) GetByKey(ctx context.Context, key string) (*Workspace, error) {
	directory, err := DecodeKey(key)
	if err != nil {
		return nil, err
	}
	return s.GetByDirectory(ctx, directory)
}

func (s *Service) GetByOpencodeProjectID(ctx context.Context, projectID string) (*Workspace, error) {
	if strings.TrimSpace(projectID) == "" {
		return nil, nil
	}
	row, err := s.queries.GetWorkspaceByOpencodeProjectID(ctx, toNullString(projectID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	workspace := mapWorkspace(row)
	return &workspace, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (*Workspace, error) {
	directory, err := normalizeDirectory(input.Directory)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = filepath.Base(directory)
	}

	now := time.Now().UTC()
	row, err := s.queries.CreateWorkspace(ctx, sqlc.CreateWorkspaceParams{
		Name:              name,
		Directory:         directory,
		Description:       toNullString(strings.TrimSpace(input.Description)),
		OpencodeProjectID: sql.NullString{},
		CodexWorkspaceID:  sql.NullString{},
		ClaudeWorkspaceID: sql.NullString{},
		CreatedAt:         now.UnixMilli(),
		UpdatedAt:         now.UnixMilli(),
	})
	if err != nil {
		return nil, err
	}

	workspace := mapWorkspace(row)
	return &workspace, nil
}

func (s *Service) UpsertFromSync(ctx context.Context, input SyncInput) (*Workspace, error) {
	directory, err := normalizeDirectory(input.Directory)
	if err != nil {
		return nil, err
	}
	createdAt := input.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	updatedAt := input.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = createdAt
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = filepath.Base(directory)
	}

	row, err := s.queries.UpsertWorkspaceFromSync(ctx, sqlc.UpsertWorkspaceFromSyncParams{
		Name:              name,
		Directory:         directory,
		Description:       toNullString(strings.TrimSpace(input.Description)),
		OpencodeProjectID: toNullString(strings.TrimSpace(input.OpencodeProjectID)),
		CreatedAt:         createdAt.UnixMilli(),
		UpdatedAt:         updatedAt.UnixMilli(),
	})
	if err != nil {
		return nil, err
	}

	workspace := mapWorkspace(row)
	return &workspace, nil
}

func (s *Service) SyncOpencodeProjects(ctx context.Context, provider agent.AgentProvider) error {
	if provider == nil || provider.Projects() == nil {
		return nil
	}
	projects, err := provider.Projects().List(ctx)
	if err != nil {
		return err
	}
	for _, project := range projects {
		name := filepath.Base(project.Worktree)
		if name == "." || name == string(filepath.Separator) {
			name = project.ID
		}
		updatedAt := project.CreatedAt
		if project.Initialized != nil {
			updatedAt = *project.Initialized
		}
		if _, err := s.UpsertFromSync(ctx, SyncInput{
			Name:              name,
			Directory:         project.Worktree,
			OpencodeProjectID: project.ID,
			CreatedAt:         project.CreatedAt,
			UpdatedAt:         updatedAt,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) SyncOpencodeDatabase(ctx context.Context, dbPath string) error {
	trimmed := strings.TrimSpace(dbPath)
	if trimmed == "" {
		return fmt.Errorf("opencode database path is required")
	}

	conn, err := sql.Open("sqlite", trimmed)
	if err != nil {
		return fmt.Errorf("open opencode database: %w", err)
	}
	defer conn.Close()

	const query = `
		SELECT id, worktree, COALESCE(name, ''), time_created, time_updated, time_initialized
		FROM project
		WHERE worktree IS NOT NULL AND worktree != '' AND worktree != '/'
		ORDER BY time_updated DESC
	`

	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("query opencode projects: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var projectID string
		var worktree string
		var name string
		var createdAt int64
		var updatedAt int64
		var initializedAt sql.NullInt64

		if err := rows.Scan(&projectID, &worktree, &name, &createdAt, &updatedAt, &initializedAt); err != nil {
			return fmt.Errorf("scan opencode project: %w", err)
		}

		if strings.TrimSpace(name) == "" {
			name = filepath.Base(worktree)
		}

		timestamp := time.UnixMilli(updatedAt).UTC()
		if initializedAt.Valid {
			timestamp = time.UnixMilli(initializedAt.Int64).UTC()
		}

		if _, err := s.UpsertFromSync(ctx, SyncInput{
			Name:              name,
			Directory:         worktree,
			OpencodeProjectID: projectID,
			CreatedAt:         time.UnixMilli(createdAt).UTC(),
			UpdatedAt:         timestamp,
		}); err != nil {
			return err
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate opencode projects: %w", err)
	}

	return nil
}

func (s *Service) EnsureOpencodeProjectID(ctx context.Context, provider agent.AgentProvider, workspace *Workspace) (string, error) {
	if workspace == nil {
		return "", fmt.Errorf("workspace is required")
	}
	if workspace.OpencodeProjectID != "" {
		return workspace.OpencodeProjectID, nil
	}
	if provider == nil || provider.Projects() == nil {
		return "", fmt.Errorf("opencode project provider is unavailable")
	}
	projectID, err := provider.Projects().ResolveIDByDirectory(ctx, workspace.Directory)
	if err != nil {
		return "", err
	}
	if projectID == "" {
		return "", fmt.Errorf("opencode project not found for %q", workspace.Directory)
	}
	row, err := s.queries.UpdateWorkspace(ctx, sqlc.UpdateWorkspaceParams{
		Name:              workspace.Name,
		Directory:         workspace.Directory,
		Description:       toNullString(workspace.Description),
		OpencodeProjectID: toNullString(projectID),
		CodexWorkspaceID:  toNullString(workspace.CodexWorkspaceID),
		ClaudeWorkspaceID: toNullString(workspace.ClaudeWorkspaceID),
		UpdatedAt:         time.Now().UTC().UnixMilli(),
	})
	if err != nil {
		return "", err
	}
	updated := mapWorkspace(row)
	*workspace = updated
	return projectID, nil
}

func mapWorkspace(row sqlc.Workspace) Workspace {
	return Workspace{
		ID:                row.ID,
		Key:               EncodeKey(row.Directory),
		Name:              row.Name,
		Directory:         row.Directory,
		Description:       row.Description.String,
		OpencodeProjectID: row.OpencodeProjectID.String,
		CodexWorkspaceID:  row.CodexWorkspaceID.String,
		ClaudeWorkspaceID: row.ClaudeWorkspaceID.String,
		CreatedAt:         time.UnixMilli(row.CreatedAt).UTC(),
		UpdatedAt:         time.UnixMilli(row.UpdatedAt).UTC(),
	}
}

func normalizeDirectory(directory string) (string, error) {
	trimmed := strings.TrimSpace(directory)
	if trimmed == "" {
		return "", fmt.Errorf("directory is required")
	}
	abs, err := filepath.Abs(trimmed)
	if err != nil {
		return "", fmt.Errorf("resolve directory: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("stat directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%q is not a directory", abs)
	}
	return filepath.Clean(abs), nil
}

func toNullString(value string) sql.NullString {
	if strings.TrimSpace(value) == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}
