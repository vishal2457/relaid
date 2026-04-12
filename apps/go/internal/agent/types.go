package agent

import (
	"context"
	"encoding/json"
	"time"
)

type ProviderID string

const ProviderOpencode ProviderID = "opencode"

type CapabilitySet struct {
	ProjectsList   bool `json:"projectsList"`
	ProjectsGet    bool `json:"projectsGet"`
	SessionsList   bool `json:"sessionsList"`
	SessionsGet    bool `json:"sessionsGet"`
	SessionsMsgs   bool `json:"sessionsMessages"`
	SessionsDiff   bool `json:"sessionsDiff"`
	SessionsAbort  bool `json:"sessionsAbort"`
	SessionsRun    bool `json:"sessionsRun"`
	SessionsStream bool `json:"sessionsStream"`
	ProvidersList  bool `json:"providersList"`
}

type AgentProvider interface {
	ID() ProviderID
	Capabilities() CapabilitySet
	Projects() ProjectService
	Sessions() SessionService
	Providers() ProviderService
	Shutdown(context.Context) error
}

type ProjectService interface {
	List(context.Context) ([]Project, error)
	Get(context.Context, string) (*Project, error)
}

type SessionService interface {
	List(context.Context, SessionFilters) ([]Session, string, error)
	Get(context.Context, string) (*Session, error)
	Create(context.Context, string) (*Session, error)
	Messages(context.Context, string, int) ([]MessageEnvelope, error)
	Diff(context.Context, string, string) ([]FileDiff, error)
	Run(context.Context, RunInput) (*RunResult, error)
	RunStream(context.Context, RunInput, func(StreamChunk)) (*RunResult, error)
	Abort(context.Context, string, string) (bool, error)
}

type ProviderService interface {
	List(context.Context) ([]Provider, error)
}

type ModelRef struct {
	ProviderID string `json:"providerId"`
	ModelID    string `json:"modelId"`
}

type RunInput struct {
	Prompt       string
	WorkingDir   string
	SessionID    string
	SystemPrompt string
	Model        *ModelRef
}

type RunResult struct {
	Success   bool          `json:"success"`
	Output    string        `json:"output"`
	Error     string        `json:"error,omitempty"`
	ExitCode  int           `json:"exitCode"`
	Duration  time.Duration `json:"-"`
	SessionID string        `json:"sessionId,omitempty"`
}

type StreamChunk struct {
	Type       string `json:"type"`
	Content    string `json:"content"`
	MessageID  string `json:"messageId,omitempty"`
	IsComplete bool   `json:"isComplete,omitempty"`
}

type SessionFilters struct {
	ProjectID string
	Status    string
	Limit     int
	Cursor    string
}

type SessionState string

const (
	SessionPending   SessionState = "pending"
	SessionRunning   SessionState = "running"
	SessionCompleted SessionState = "completed"
	SessionFailed    SessionState = "failed"
	SessionAborted   SessionState = "aborted"
)

type FileDiff struct {
	File      string `json:"file"`
	Before    string `json:"before"`
	After     string `json:"after"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch,omitempty"`
}

type SessionSummary struct {
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
	Files     int        `json:"files"`
	Diffs     []FileDiff `json:"diffs,omitempty"`
}

type Session struct {
	ID         string
	ProjectID  string
	Directory  string
	ParentID   string
	Title      string
	Version    string
	Status     SessionState
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Summary    *SessionSummary
	ShareURL   string
	Output     string
	Error      string
	ExitCode   *int
	DurationMs *int64
	StartedAt  *time.Time
	EndedAt    *time.Time
}

type Project struct {
	ID          string
	Worktree    string
	VCS         string
	CreatedAt   time.Time
	Initialized *time.Time
}

type Model struct {
	ID   string
	Name string
}

type Provider struct {
	ID     string
	Name   string
	Models []Model
}

type MessageEnvelope struct {
	Info  json.RawMessage   `json:"info"`
	Parts []json.RawMessage `json:"parts"`
}
