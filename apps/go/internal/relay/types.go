package relay

import (
	"encoding/json"

	"relaid/internal/agent"
)

type EnvelopePayload = agent.SessionMessagesResponse

const (
	EventProjectsListRequest         = "projects_list_request"
	EventProjectsListResponse        = "projects_list_response"
	EventProjectGetRequest           = "project_get_request"
	EventProjectGetResponse          = "project_get_response"
	EventProjectDirectoryRequest     = "project_directory_request"
	EventProjectDirectoryResponse    = "project_directory_response"
	EventProjectFileContentRequest   = "project_file_content_request"
	EventProjectFileContentResponse  = "project_file_content_response"
	EventProjectFileSearchRequest    = "project_file_search_request"
	EventProjectFileSearchResponse   = "project_file_search_response"
	EventProjectBranchesRequest      = "project_branches_request"
	EventProjectBranchesResponse     = "project_branches_response"
	EventProjectBranchSwitchRequest  = "project_branch_switch_request"
	EventProjectBranchSwitchResponse = "project_branch_switch_response"

	EventSessionsListRequest     = "sessions_list_request"
	EventSessionsListResponse    = "sessions_list_response"
	EventSessionGetRequest       = "session_get_request"
	EventSessionGetResponse      = "session_get_response"
	EventSessionCreateRequest    = "session_create_request"
	EventSessionCreateResponse   = "session_create_response"
	EventSessionMessagesRequest  = "session_messages_request"
	EventSessionMessagesResponse = "session_messages_response"
	EventSessionDiffRequest      = "session_diff_request"
	EventSessionDiffResponse     = "session_diff_response"
	EventSessionUpdateRequest    = "session_update_request"
	EventSessionUpdateResponse   = "session_update_response"

	EventSessionPromptRequest  = "session_prompt_request"
	EventSessionPromptStarted  = "session_prompt_started"
	EventSessionStreamChunk    = "session_stream_chunk"
	EventSessionPromptResponse = "session_prompt_response"
	EventSessionAbort          = "session_abort"
	EventSessionAborted        = "session_aborted"

	EventProvidersListRequest  = "providers_list_request"
	EventProvidersListResponse = "providers_list_response"
	EventAgentsListRequest     = "agents_list_request"
	EventAgentsListResponse    = "agents_list_response"
	EventAppsListRequest       = "apps_list_request"
	EventAppsListResponse      = "apps_list_response"

	EventGitStagedFilesRequest   = "git_staged_files_request"
	EventGitStagedFilesResponse  = "git_staged_files_response"
	EventGitStageFilesRequest    = "git_stage_files_request"
	EventGitStageFilesResponse   = "git_stage_files_response"
	EventGitUnstageFilesRequest  = "git_unstage_files_request"
	EventGitUnstageFilesResponse = "git_unstage_files_response"
	EventGitFileDiffRequest      = "git_file_diff_request"
	EventGitFileDiffResponse     = "git_file_diff_response"
	EventGitDiscardFileRequest   = "git_discard_file_request"
	EventGitDiscardFileResponse  = "git_discard_file_response"

	EventGitLogRequest               = "git_log_request"
	EventGitLogResponse              = "git_log_response"
	EventGitGetCurrentBranchRequest  = "git_get_current_branch_request"
	EventGitGetCurrentBranchResponse = "git_get_current_branch_response"
	EventGitListBranchesRequest      = "git_list_branches_request"
	EventGitListBranchesResponse     = "git_list_branches_response"
	EventGitCreateBranchRequest      = "git_create_branch_request"
	EventGitCreateBranchResponse     = "git_create_branch_response"
	EventGitDeleteBranchRequest      = "git_delete_branch_request"
	EventGitDeleteBranchResponse     = "git_delete_branch_response"
	EventGitSwitchBranchRequest      = "git_switch_branch_request"
	EventGitSwitchBranchResponse     = "git_switch_branch_response"
	EventGitCommitRequest            = "git_commit_request"
	EventGitCommitResponse           = "git_commit_response"
	EventGitPushRequest              = "git_push_request"
	EventGitPushResponse             = "git_push_response"
	EventGitPullRequest              = "git_pull_request"
	EventGitPullResponse             = "git_pull_response"
	EventGitFetchRequest             = "git_fetch_request"
	EventGitFetchResponse            = "git_fetch_response"
	EventGitGetRemotesRequest        = "git_get_remotes_request"
	EventGitGetRemotesResponse       = "git_get_remotes_response"
	EventGitAddRemoteRequest         = "git_add_remote_request"
	EventGitAddRemoteResponse        = "git_add_remote_response"
	EventGitRemoveRemoteRequest      = "git_remove_remote_request"
	EventGitRemoveRemoteResponse     = "git_remove_remote_response"
	EventGitDiffStagedRequest        = "git_diff_staged_request"
	EventGitDiffStagedResponse       = "git_diff_staged_response"
	EventGitDiffUnstagedRequest      = "git_diff_unstaged_request"
	EventGitDiffUnstagedResponse     = "git_diff_unstaged_response"
	EventGitGetFileContentRequest    = "git_get_file_content_request"
	EventGitGetFileContentResponse   = "git_get_file_content_response"
	EventGitStashRequest             = "git_stash_request"
	EventGitStashResponse            = "git_stash_response"
	EventGitStashPopRequest          = "git_stash_pop_request"
	EventGitStashPopResponse         = "git_stash_pop_response"
	EventGitMergeRequest             = "git_merge_request"
	EventGitMergeResponse            = "git_merge_response"
	EventGitRebaseRequest            = "git_rebase_request"
	EventGitRebaseResponse           = "git_rebase_response"
	EventGitRebaseAbortRequest       = "git_rebase_abort_request"
	EventGitRebaseAbortResponse      = "git_rebase_abort_response"
	EventGitCreateTagRequest         = "git_create_tag_request"
	EventGitCreateTagResponse        = "git_create_tag_response"
	EventGitListTagsRequest          = "git_list_tags_request"
	EventGitListTagsResponse         = "git_list_tags_response"
	EventGitResetRequest             = "git_reset_request"
	EventGitResetResponse            = "git_reset_response"
	EventGitAddAllRequest            = "git_add_all_request"
	EventGitAddAllResponse           = "git_add_all_response"

	EventPermissionRequest  = "permission_request"
	EventPermissionResponse = "permission_response"
	EventQuestionRequest    = "question_request"
	EventQuestionResponse   = "question_response"

	EventSkillsListRequest  = "skills_list_request"
	EventSkillsListResponse = "skills_list_response"

	EventErrorResponse = "error_response"
)

type RequestEnvelope struct {
	RequestID string `json:"requestId"`
}

type ProjectsListRequest struct {
	RequestID string `json:"requestId"`
}

type ProjectsListResponse struct {
	RequestID string           `json:"requestId"`
	Projects  []ProjectPayload `json:"projects"`
}

type ProjectGetRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type ProjectGetResponse struct {
	RequestID string          `json:"requestId"`
	Project   *ProjectPayload `json:"project"`
}

type ProjectDirectoryRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path,omitempty"`
}

type ProjectDirectoryResponse struct {
	RequestID string                 `json:"requestId"`
	Tree      []ProjectDirectoryNode `json:"tree"`
}

type ProjectFileContentRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
}

type ProjectFileContentResponse struct {
	RequestID string `json:"requestId"`
	Content   string `json:"content"`
	Truncated bool   `json:"truncated,omitempty"`
}

type ProjectFileSearchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Query     string `json:"query,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

type ProjectFileSearchResponse struct {
	RequestID string             `json:"requestId"`
	Results   []ProjectFileMatch `json:"results"`
}

type ProjectBranchesRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
}

type ProjectBranchesResponse struct {
	RequestID string       `json:"requestId"`
	Branches  []BranchInfo `json:"branches"`
}

type ProjectBranchSwitchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Branch    string `json:"branch"`
}

type ProjectBranchSwitchResponse struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Success   bool   `json:"success"`
}

type ProjectPayload struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Folder        string `json:"folder"`
	LocalServerID string `json:"localServerId,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type ProjectDirectoryNode struct {
	Name     string                 `json:"name"`
	Path     string                 `json:"path"`
	Type     string                 `json:"type"` // "file" | "directory"
	Children []ProjectDirectoryNode `json:"children,omitempty"`
}

type ProjectFileMatch struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"` // "file" | "directory"
}

type SessionsListRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	Cwd             string `json:"cwd,omitempty"`
	Status          string `json:"status,omitempty"`
	Limit           int    `json:"limit,omitempty"`
}

type SessionsListResponse struct {
	RequestID string           `json:"requestId"`
	Sessions  []SessionPayload `json:"sessions"`
}

type SessionGetRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
}

type SessionGetResponse struct {
	RequestID string          `json:"requestId"`
	Session   *SessionPayload `json:"session"`
}

type SessionCreateRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	ProjectID       string `json:"projectId"`
	Prompt          string `json:"prompt,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	UserID          string `json:"userId,omitempty"`
}

type SessionCreateResponse struct {
	RequestID string         `json:"requestId"`
	Session   SessionPayload `json:"session"`
}

type SessionMessagesRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
	Limit           int    `json:"limit,omitempty"`
}

type SessionMessagesResponse struct {
	RequestID string            `json:"requestId"`
	Envelopes []EnvelopePayload `json:"messages"`
}

type SessionDiffRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
}

type SessionDiffResponse struct {
	RequestID string     `json:"requestId"`
	Diffs     []FileDiff `json:"diffs"`
}

type SessionUpdateRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
	Status          string `json:"status"`
	Output          string `json:"output,omitempty"`
	Error           string `json:"error,omitempty"`
	ExitCode        int    `json:"exitCode,omitempty"`
	Duration        int    `json:"duration,omitempty"`
}

type SessionUpdateResponse struct {
	RequestID string          `json:"requestId"`
	Session   *SessionPayload `json:"session"`
}

type SessionPromptRequest struct {
	RequestID       string          `json:"requestId"`
	AgentProviderID string          `json:"agentProviderId,omitempty"`
	ProjectID       string          `json:"projectId"`
	SessionID       string          `json:"sessionId"`
	Prompt          string          `json:"prompt"`
	Agent           string          `json:"agent,omitempty"`
	UserID          string          `json:"userId,omitempty"`
	Model           *agent.ModelRef `json:"model,omitempty"`
	AppMentions     []AppMention    `json:"appMentions,omitempty"`
}

type AppMention struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ModelRef struct {
	ProviderID string `json:"providerId"`
	ModelID    string `json:"modelId"`
}

type SessionPromptStarted struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	SessionID string `json:"sessionId"`
}

type SessionStreamChunkPayload struct {
	RequestID  string `json:"requestId"`
	ProjectID  string `json:"projectId"`
	SessionID  string `json:"sessionId"`
	MessageID  string `json:"messageId,omitempty"`
	Chunk      string `json:"chunk"`
	Type       string `json:"type"`
	IsComplete bool   `json:"isComplete,omitempty"`
}

type SessionPromptResponsePayload struct {
	RequestID    string           `json:"requestId"`
	ProjectID    string           `json:"projectId"`
	SessionID    string           `json:"sessionId"`
	SessionTitle string           `json:"sessionTitle,omitempty"`
	Success      bool             `json:"success"`
	Output       string           `json:"output"`
	Error        string           `json:"error,omitempty"`
	ExitCode     int              `json:"exitCode"`
	Duration     int              `json:"duration"`
	Messages     []MessagePayload `json:"messages,omitempty"`
}

type SessionAbortPayload struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
	ProjectID       string `json:"projectId"`
}

type SessionAbortedPayload struct {
	RequestID string `json:"requestId"`
	SessionID string `json:"sessionId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type SessionPayload struct {
	ID              string `json:"id"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	ProjectID       string `json:"projectID,omitempty"`
	Directory       string `json:"directory,omitempty"`
	UserID          string `json:"userId,omitempty"`
	Status          string `json:"status"`
	Prompt          string `json:"prompt"`
	Output          string `json:"output,omitempty"`
	Error           string `json:"error,omitempty"`
	ExitCode        *int   `json:"exitCode,omitempty"`
	Duration        *int   `json:"duration,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	StartedAt       string `json:"startedAt,omitempty"`
	CompletedAt     string `json:"completedAt,omitempty"`
}

type MessagePayload struct {
	ID                      string        `json:"id"`
	SessionID               string        `json:"sessionId"`
	Role                    string        `json:"role"`
	Content                 string        `json:"content"`
	VisibleContent          string        `json:"visibleContent"`
	ThinkingContent         string        `json:"thinkingContent"`
	ThinkingDurationSeconds *int          `json:"thinkingDurationSeconds,omitempty"`
	Parts                   []MessagePart `json:"parts"`
	CreatedAt               string        `json:"createdAt"`
}

type MessagePart struct {
	Type            string `json:"type"`
	Content         string `json:"content"`
	DurationSeconds *int   `json:"durationSeconds,omitempty"`
}

type FileDiff struct {
	File      string `json:"file"`
	Before    string `json:"before"`
	After     string `json:"after"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch,omitempty"`
}

type ProvidersListRequest struct {
	RequestID string `json:"requestId"`
}

type ProvidersListResponse struct {
	RequestID string            `json:"requestId"`
	Providers []ProviderPayload `json:"providers"`
}

type AppsListRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	Limit           int    `json:"limit,omitempty"`
	ForceRefetch    bool   `json:"forceRefetch,omitempty"`
}

type AppPayload struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	IsAccessible bool     `json:"isAccessible"`
	IsEnabled    bool     `json:"isEnabled"`
	Labels       []string `json:"labels,omitempty"`
}

type AppsListResponse struct {
	RequestID string       `json:"requestId"`
	Apps      []AppPayload `json:"apps"`
}

type AgentsListRequest struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	ProjectID       string `json:"projectId,omitempty"`
	Directory       string `json:"directory,omitempty"`
}

type AgentsListResponse struct {
	RequestID string         `json:"requestId"`
	Agents    []AgentPayload `json:"agents"`
}

type AgentPayload struct {
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Mode        string        `json:"mode"`
	BuiltIn     bool          `json:"builtIn"`
	Model       *ModelRefJSON `json:"model,omitempty"`
}

type ModelRefJSON struct {
	ProviderID string `json:"providerID"`
	ModelID    string `json:"modelID"`
}

type ProviderPayload struct {
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	AgentProviderID   string         `json:"agentProviderId,omitempty"`
	AgentProviderName string         `json:"agentProviderName,omitempty"`
	ProviderID        string         `json:"providerId,omitempty"`
	ProviderName      string         `json:"providerName,omitempty"`
	Models            []ModelPayload `json:"models"`
}

type ModelPayload struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	AgentProviderID   string `json:"agentProviderId,omitempty"`
	AgentProviderName string `json:"agentProviderName,omitempty"`
	ProviderID        string `json:"providerId,omitempty"`
	ProviderName      string `json:"providerName,omitempty"`
	ModelID           string `json:"modelId,omitempty"`
	ModelName         string `json:"modelName,omitempty"`
}

type GitStagedFilesRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitStagedFilesResponse struct {
	RequestID string    `json:"requestId"`
	Staged    []GitFile `json:"staged"`
	Unstaged  []GitFile `json:"unstaged"`
	Branch    string    `json:"branch"`
}

type GitFile struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type GitStageFilesRequest struct {
	RequestID string   `json:"requestId"`
	ProjectID string   `json:"projectId"`
	Files     []string `json:"files"`
}

type GitStageFilesResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
}

type GitUnstageFilesRequest struct {
	RequestID string   `json:"requestId"`
	ProjectID string   `json:"projectId"`
	Files     []string `json:"files"`
}

type GitUnstageFilesResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
}

type GitFileDiffRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	FilePath  string `json:"filePath"`
}

type GitFileDiffResponse struct {
	RequestID string    `json:"requestId"`
	Files     []GitDiff `json:"files"`
	Success   bool      `json:"success"`
	Error     string    `json:"error,omitempty"`
}

type GitDiff struct {
	FileName string        `json:"fileName"`
	Hunks    []GitDiffHunk `json:"hunks"`
}

type GitDiffHunk struct {
	Header string        `json:"header"`
	Lines  []GitDiffLine `json:"lines"`
}

type GitDiffLine struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

type GitDiscardFileRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	FilePath  string `json:"filePath"`
}

type GitDiscardFileResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitLogRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Count     int    `json:"count,omitempty"`
}

type GitLogResponse struct {
	RequestID string          `json:"requestId"`
	Commits   []GitCommitInfo `json:"commits"`
	Error     string          `json:"error,omitempty"`
}

type GitCommitInfo struct {
	Hash      string `json:"hash"`
	ShortHash string `json:"shortHash"`
	Author    string `json:"author"`
	Date      string `json:"date"`
	Message   string `json:"message"`
}

type GitGetCurrentBranchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitGetCurrentBranchResponse struct {
	RequestID string `json:"requestId"`
	Branch    string `json:"branch"`
	Error     string `json:"error,omitempty"`
}

type GitListBranchesRequest struct {
	RequestID     string `json:"requestId"`
	ProjectID     string `json:"projectId"`
	IncludeRemote bool   `json:"includeRemote,omitempty"`
}

type GitListBranchesResponse struct {
	RequestID string       `json:"requestId"`
	Branches  []BranchInfo `json:"branches"`
	Error     string       `json:"error,omitempty"`
}

type GitCreateBranchRequest struct {
	RequestID  string `json:"requestId"`
	ProjectID  string `json:"projectId"`
	Name       string `json:"name"`
	StartPoint string `json:"startPoint,omitempty"`
}

type GitCreateBranchResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Branch    string `json:"branch,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitDeleteBranchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	Force     bool   `json:"force,omitempty"`
}

type GitDeleteBranchResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitSwitchBranchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Branch    string `json:"branch"`
}

type GitSwitchBranchResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Branch    string `json:"branch,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitCommitRequest struct {
	RequestID string   `json:"requestId"`
	ProjectID string   `json:"projectId"`
	Message   string   `json:"message"`
	Files     []string `json:"files,omitempty"`
}

type GitCommitResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Hash      string `json:"hash,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitPushRequest struct {
	RequestID   string `json:"requestId"`
	ProjectID   string `json:"projectId"`
	Remote      string `json:"remote,omitempty"`
	Branch      string `json:"branch,omitempty"`
	SetUpstream bool   `json:"setUpstream,omitempty"`
}

type GitPushResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitPullRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Remote    string `json:"remote,omitempty"`
	Branch    string `json:"branch,omitempty"`
}

type GitPullResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitFetchRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Remote    string `json:"remote,omitempty"`
}

type GitFetchResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitGetRemotesRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitGetRemotesResponse struct {
	RequestID string          `json:"requestId"`
	Remotes   []GitRemoteInfo `json:"remotes"`
	Error     string          `json:"error,omitempty"`
}

type GitRemoteInfo struct {
	Name     string `json:"name"`
	FetchURL string `json:"fetchUrl"`
	PushURL  string `json:"pushUrl"`
}

type GitAddRemoteRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	URL       string `json:"url"`
}

type GitAddRemoteResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitRemoveRemoteRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
}

type GitRemoveRemoteResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitDiffStagedRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitDiffStagedResponse struct {
	RequestID string `json:"requestId"`
	Diff      string `json:"diff"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitDiffUnstagedRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitDiffUnstagedResponse struct {
	RequestID string `json:"requestId"`
	Diff      string `json:"diff"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitGetFileContentRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	FilePath  string `json:"filePath"`
}

type GitGetFileContentResponse struct {
	RequestID string `json:"requestId"`
	Content   string `json:"content"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitStashRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Message   string `json:"message,omitempty"`
}

type GitStashResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitStashPopRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitStashPopResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitMergeRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Branch    string `json:"branch"`
	Message   string `json:"message,omitempty"`
}

type GitMergeResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitRebaseRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Branch    string `json:"branch"`
}

type GitRebaseResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitRebaseAbortRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitRebaseAbortResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

type GitCreateTagRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	Message   string `json:"message,omitempty"`
}

type GitCreateTagResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Name      string `json:"name,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitListTagsRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitListTagsResponse struct {
	RequestID string   `json:"requestId"`
	Tags      []string `json:"tags"`
	Error     string   `json:"error,omitempty"`
}

type GitResetRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Mode      string `json:"mode"`
	Ref       string `json:"ref,omitempty"`
}

type GitResetResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type GitAddAllRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
}

type GitAddAllResponse struct {
	RequestID string `json:"requestId"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}

type PermissionRequestPayload struct {
	RequestID       string                 `json:"requestId"`
	AgentProviderID string                 `json:"agentProviderId,omitempty"`
	ProjectID       string                 `json:"projectId"`
	SessionID       string                 `json:"sessionId"`
	JobID           string                 `json:"jobId"`
	ThreadID        string                 `json:"threadId"`
	Permission      string                 `json:"permission"`
	Patterns        []string               `json:"patterns"`
	Metadata        map[string]interface{} `json:"metadata"`
}

type PermissionResponsePayload struct {
	RequestID       string `json:"requestId"`
	AgentProviderID string `json:"agentProviderId,omitempty"`
	SessionID       string `json:"sessionId"`
	JobID           string `json:"jobId"`
	Reply           string `json:"reply"`
}

type QuestionOption struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

type Question struct {
	Header   string           `json:"header"`
	Question string           `json:"question"`
	Options  []QuestionOption `json:"options"`
	Multiple bool             `json:"multiple,omitempty"`
	Custom   bool             `json:"custom,omitempty"`
}

type QuestionRequestPayload struct {
	RequestID       string     `json:"requestId"`
	AgentProviderID string     `json:"agentProviderId,omitempty"`
	ProjectID       string     `json:"projectId"`
	SessionID       string     `json:"sessionId"`
	JobID           string     `json:"jobId"`
	ThreadID        string     `json:"threadId"`
	Questions       []Question `json:"questions"`
}

type QuestionResponsePayload struct {
	RequestID       string     `json:"requestId"`
	AgentProviderID string     `json:"agentProviderId,omitempty"`
	SessionID       string     `json:"sessionId"`
	JobID           string     `json:"jobId"`
	Answers         [][]string `json:"answers"`
}

type ErrorResponse struct {
	RequestID string `json:"requestId"`
	Code      string `json:"code"`
	Message   string `json:"message"`
}

type SkillsListRequest struct {
	RequestID string `json:"requestId"`
	ProjectID string `json:"projectId"`
	Query     string `json:"query,omitempty"`
}

type SkillPayload struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"`
}

type SkillsListResponse struct {
	RequestID string         `json:"requestId"`
	Skills    []SkillPayload `json:"skills"`
}

func ParseRequestEnvelope(data json.RawMessage) (RequestEnvelope, error) {
	var env RequestEnvelope
	err := json.Unmarshal(data, &env)
	return env, err
}

func MakeErrorResponse(requestID string, code string, message string) ErrorResponse {
	return ErrorResponse{
		RequestID: requestID,
		Code:      code,
		Message:   message,
	}
}
