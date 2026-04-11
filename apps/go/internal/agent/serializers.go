package agent

import "time"

type SessionJSON struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"projectID"`
	Directory string          `json:"directory"`
	ParentID  string          `json:"parentID,omitempty"`
	Summary   *SessionSummary `json:"summary,omitempty"`
	Share     *struct {
		URL string `json:"url"`
	} `json:"share,omitempty"`
	Title       string       `json:"title"`
	Version     string       `json:"version"`
	Time        SessionTime  `json:"time"`
	Status      SessionState `json:"status,omitempty"`
	Output      *string      `json:"output,omitempty"`
	Error       *string      `json:"error,omitempty"`
	ExitCode    *int         `json:"exitCode,omitempty"`
	Duration    *int64       `json:"duration,omitempty"`
	StartedAt   *int64       `json:"startedAt,omitempty"`
	CompletedAt *int64       `json:"completedAt,omitempty"`
}

type SessionTime struct {
	Created    int64 `json:"created"`
	Updated    int64 `json:"updated"`
	Compacting int64 `json:"compacting,omitempty"`
}

type ProjectJSON struct {
	ID       string `json:"id"`
	Worktree string `json:"worktree"`
	Vcs      string `json:"vcs,omitempty"`
	Time     struct {
		Created     int64 `json:"created"`
		Initialized int64 `json:"initialized,omitempty"`
	} `json:"time"`
}

type ProviderJSON struct {
	ID     string      `json:"id"`
	Name   string      `json:"name"`
	Models []ModelJSON `json:"models"`
}

type ModelJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type RunResultJSON struct {
	Success   bool   `json:"success"`
	Output    string `json:"output"`
	Error     string `json:"error,omitempty"`
	ExitCode  int    `json:"exitCode"`
	Duration  int64  `json:"duration"`
	SessionID string `json:"sessionId,omitempty"`
}

func SerializeSession(value Session) SessionJSON {
	payload := SessionJSON{
		ID:        value.ID,
		ProjectID: value.ProjectID,
		Directory: value.Directory,
		ParentID:  value.ParentID,
		Summary:   value.Summary,
		Title:     value.Title,
		Version:   value.Version,
		Time: SessionTime{
			Created: value.CreatedAt.UnixMilli(),
			Updated: value.UpdatedAt.UnixMilli(),
		},
		Status:   value.Status,
		ExitCode: value.ExitCode,
		Duration: value.DurationMs,
	}

	if value.ShareURL != "" {
		payload.Share = &struct {
			URL string `json:"url"`
		}{URL: value.ShareURL}
	}

	if value.Output != "" {
		output := value.Output
		payload.Output = &output
	}

	if value.Error != "" {
		err := value.Error
		payload.Error = &err
	}

	if value.StartedAt != nil {
		timestamp := value.StartedAt.UnixMilli()
		payload.StartedAt = &timestamp
	}

	if value.EndedAt != nil {
		timestamp := value.EndedAt.UnixMilli()
		payload.CompletedAt = &timestamp
	}

	return payload
}

func SerializeProject(value Project) ProjectJSON {
	payload := ProjectJSON{
		ID:       value.ID,
		Worktree: value.Worktree,
		Vcs:      value.VCS,
	}
	payload.Time.Created = value.CreatedAt.UnixMilli()
	if value.Initialized != nil {
		payload.Time.Initialized = value.Initialized.UnixMilli()
	}
	return payload
}

func SerializeProvider(value Provider) ProviderJSON {
	models := make([]ModelJSON, 0, len(value.Models))
	for _, model := range value.Models {
		models = append(models, ModelJSON{
			ID:   model.ID,
			Name: model.Name,
		})
	}

	return ProviderJSON{
		ID:     value.ID,
		Name:   value.Name,
		Models: models,
	}
}

func SerializeRunResult(value RunResult) RunResultJSON {
	return RunResultJSON{
		Success:   value.Success,
		Output:    value.Output,
		Error:     value.Error,
		ExitCode:  value.ExitCode,
		Duration:  value.Duration.Milliseconds(),
		SessionID: value.SessionID,
	}
}

func MillisToTime(value int64) time.Time {
	return time.UnixMilli(value)
}
