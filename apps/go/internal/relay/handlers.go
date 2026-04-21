package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/filesystem"
	gitservice "relaid/internal/git"
	"relaid/internal/workspace"
)

type Handler struct {
	client     *Client
	registry   *agent.Registry
	logger     *log.Logger
	workspaces *workspace.Service

	dirService         *filesystem.DirectoryService
	pendingPermissions map[string]chan PermissionReply
	pendingQuestions   map[string]chan QuestionReply
	mu                 sync.Mutex
}

type PermissionReply struct {
	Reply string
}

type QuestionReply struct {
	Answers [][]string
}

func NewHandler(client *Client, registry *agent.Registry, workspaces *workspace.Service, logger *log.Logger) *Handler {
	return &Handler{
		client:             client,
		registry:           registry,
		logger:             logger,
		workspaces:         workspaces,
		dirService:         filesystem.NewDirectoryService(),
		pendingPermissions: make(map[string]chan PermissionReply),
		pendingQuestions:   make(map[string]chan QuestionReply),
	}
}

func (h *Handler) OnEvent(event string, args []json.RawMessage) {
	switch event {
	case EventProjectsListRequest:
		go h.handleProjectsList(args)
	case EventProjectGetRequest:
		go h.handleProjectGet(args)
	case EventProjectDirectoryRequest:
		go h.handleProjectDirectory(args)
	case EventProjectFileContentRequest:
		go h.handleProjectFileContent(args)
	case EventProjectFileSearchRequest:
		go h.handleProjectFileSearch(args)
	case EventProjectBranchesRequest:
		go h.handleProjectBranches(args)
	case EventProjectBranchSwitchRequest:
		go h.handleProjectBranchSwitch(args)
	case EventSessionsListRequest:
		go h.handleSessionsList(args)
	case EventSessionGetRequest:
		go h.handleSessionGet(args)
	case EventSessionMessagesRequest:
		go h.handleSessionMessages(args)
	case EventSessionCreateRequest:
		go h.handleSessionCreate(args)
	case EventSessionDiffRequest:
		go h.handleSessionDiff(args)
	case EventSessionUpdateRequest:
		go h.handleSessionUpdate(args)
	case EventSessionPromptRequest:
		go h.handleSessionPromptRequest(args)
	case EventSessionAbort:
		go h.handleSessionAbort(args)
	case EventProvidersListRequest:
		go h.handleProvidersList(args)
	case EventAgentsListRequest:
		go h.handleAgentsList(args)
	case EventSkillsListRequest:
		go h.handleSkillsList(args)
	case EventGitStagedFilesRequest:
		go h.handleGitStagedFiles(args)
	case EventGitStageFilesRequest:
		go h.handleGitStageFiles(args)
	case EventGitUnstageFilesRequest:
		go h.handleGitUnstageFiles(args)
	case EventGitFileDiffRequest:
		go h.handleGitFileDiff(args)
	case EventGitDiscardFileRequest:
		go h.handleGitDiscardFile(args)
	case EventGitLogRequest:
		go h.handleGitLog(args)
	case EventGitGetCurrentBranchRequest:
		go h.handleGitGetCurrentBranch(args)
	case EventGitListBranchesRequest:
		go h.handleGitListBranches(args)
	case EventGitCreateBranchRequest:
		go h.handleGitCreateBranch(args)
	case EventGitDeleteBranchRequest:
		go h.handleGitDeleteBranch(args)
	case EventGitSwitchBranchRequest:
		go h.handleGitSwitchBranch(args)
	case EventGitCommitRequest:
		go h.handleGitCommit(args)
	case EventGitPushRequest:
		go h.handleGitPush(args)
	case EventGitPullRequest:
		go h.handleGitPull(args)
	case EventGitFetchRequest:
		go h.handleGitFetch(args)
	case EventGitGetRemotesRequest:
		go h.handleGitGetRemotes(args)
	case EventGitAddRemoteRequest:
		go h.handleGitAddRemote(args)
	case EventGitRemoveRemoteRequest:
		go h.handleGitRemoveRemote(args)
	case EventGitDiffStagedRequest:
		go h.handleGitDiffStaged(args)
	case EventGitDiffUnstagedRequest:
		go h.handleGitDiffUnstaged(args)
	case EventGitGetFileContentRequest:
		go h.handleGitGetFileContent(args)
	case EventGitStashRequest:
		go h.handleGitStash(args)
	case EventGitStashPopRequest:
		go h.handleGitStashPop(args)
	case EventGitMergeRequest:
		go h.handleGitMerge(args)
	case EventGitRebaseRequest:
		go h.handleGitRebase(args)
	case EventGitRebaseAbortRequest:
		go h.handleGitRebaseAbort(args)
	case EventGitCreateTagRequest:
		go h.handleGitCreateTag(args)
	case EventGitListTagsRequest:
		go h.handleGitListTags(args)
	case EventGitResetRequest:
		go h.handleGitReset(args)
	case EventGitAddAllRequest:
		go h.handleGitAddAll(args)
	case EventPermissionResponse:
		go h.handlePermissionResponse(args)
	case EventQuestionResponse:
		go h.handleQuestionResponse(args)

	// Response events — handled by the relay server or other clients, ignore here
	case EventProjectsListResponse,
		EventProjectGetResponse,
		EventProjectDirectoryResponse,
		EventProjectFileContentResponse,
		EventProjectFileSearchResponse,
		EventProjectBranchesResponse,
		EventProjectBranchSwitchResponse,
		EventSessionsListResponse,
		EventSessionGetResponse,
		EventSessionCreateResponse,
		EventSessionMessagesResponse,
		EventSessionDiffResponse,
		EventSessionUpdateResponse,
		EventSessionPromptStarted,
		EventSessionStreamChunk,
		EventSessionPromptResponse,
		EventSessionAborted,
		EventProvidersListResponse,
		EventAgentsListResponse,
		EventGitStagedFilesResponse,
		EventGitStageFilesResponse,
		EventGitUnstageFilesResponse,
		EventGitFileDiffResponse,
		EventGitDiscardFileResponse,
		EventSkillsListResponse,
		EventErrorResponse:
		// silently ignore response events
	default:
		h.logger.Printf("relay: unhandled event: %s", event)
	}
}

func (h *Handler) getProvider() (agent.AgentProvider, error) {
	return h.registry.Get(agent.ProviderOpencode)
}

func (h *Handler) resolveWorktree(projectID string) (string, error) {
	workspaceItem, err := h.resolveWorkspace(projectID)
	if err != nil {
		return "", err
	}
	return workspaceItem.Directory, nil
}

func (h *Handler) resolveWorkspace(projectID string) (*workspace.Workspace, error) {
	if h.workspaces == nil {
		return nil, fmt.Errorf("workspace service unavailable")
	}
	workspaceItem, err := h.workspaces.GetByKey(context.Background(), projectID)
	if err != nil {
		return nil, err
	}
	if workspaceItem == nil {
		return nil, fmt.Errorf("project %q not found", projectID)
	}
	return workspaceItem, nil
}

func (h *Handler) resolveOpencodeProjectID(projectKey string) (*workspace.Workspace, string, error) {
	workspaceItem, err := h.resolveWorkspace(projectKey)
	if err != nil {
		return nil, "", err
	}
	provider, err := h.getProvider()
	if err != nil {
		return nil, "", err
	}
	projectID, err := h.workspaces.EnsureOpencodeProjectID(context.Background(), provider, workspaceItem)
	if err != nil {
		return nil, "", err
	}
	return workspaceItem, projectID, nil
}

func (h *Handler) emit(event string, payload interface{}) {
	if err := h.client.Emit(event, payload); err != nil {
		h.logger.Printf("relay: failed to emit %s: %v", event, err)
	}
}

func (h *Handler) emitError(requestID string, code string, message string) {
	h.emit(EventErrorResponse, MakeErrorResponse(requestID, code, message))
}

func parsePayload[T any](raw json.RawMessage) (T, error) {
	var v T
	err := json.Unmarshal(raw, &v)
	return v, err
}

func (h *Handler) handleProjectsList(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectsListRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse projects_list_request: %v", err)
		return
	}

	projects, err := h.workspaces.List(context.Background())
	if err != nil {
		h.logger.Printf("relay: failed to list projects: %v", err)
		h.emit(EventProjectsListResponse, ProjectsListResponse{
			RequestID: req.RequestID,
			Projects:  []ProjectPayload{},
		})
		return
	}

	payload := ProjectsListResponse{
		RequestID: req.RequestID,
		Projects:  make([]ProjectPayload, 0, len(projects)),
	}
	for _, p := range projects {
		pp := ProjectPayload{
			ID:          p.Key,
			Name:        p.Name,
			Description: p.Description,
			Folder:      p.Directory,
			CreatedAt:   p.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
			UpdatedAt:   p.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		payload.Projects = append(payload.Projects, pp)
	}

	h.emit(EventProjectsListResponse, payload)
}

func (h *Handler) handleProjectGet(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectGetRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_get_request: %v", err)
		return
	}

	project, err := h.resolveWorkspace(req.ProjectID)
	if err != nil || project == nil {
		h.emit(EventProjectGetResponse, ProjectGetResponse{
			RequestID: req.RequestID,
			Project:   nil,
		})
		return
	}

	pp := &ProjectPayload{
		ID:          project.Key,
		Name:        project.Name,
		Description: project.Description,
		Folder:      project.Directory,
		CreatedAt:   project.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:   project.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
	}

	h.emit(EventProjectGetResponse, ProjectGetResponse{
		RequestID: req.RequestID,
		Project:   pp,
	})
}

func (h *Handler) handleProjectDirectory(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectDirectoryRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_directory_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	entries, err := h.dirService.ListDir(worktree, req.Path)
	if err != nil {
		h.emitError(req.RequestID, "DIRECTORY_READ_ERROR", err.Error())
		return
	}

	nodes := make([]ProjectDirectoryNode, 0, len(entries))
	for _, e := range entries {
		nodes = append(nodes, ProjectDirectoryNode{
			Name: e.Name,
			Path: e.Path,
			Type: e.Type,
		})
	}

	h.emit(EventProjectDirectoryResponse, ProjectDirectoryResponse{
		RequestID: req.RequestID,
		Tree:      nodes,
	})
}

func (h *Handler) handleProjectFileContent(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectFileContentRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_file_content_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	content, truncated, err := h.dirService.ReadTextFile(worktree, req.Path)
	if err != nil {
		h.emitError(req.RequestID, "FILE_CONTENT_ERROR", err.Error())
		return
	}

	h.emit(EventProjectFileContentResponse, ProjectFileContentResponse{
		RequestID: req.RequestID,
		Content:   content,
		Truncated: truncated,
	})
}

func (h *Handler) handleProjectFileSearch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectFileSearchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_file_search_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	_, opencodeProjectID, err := h.resolveOpencodeProjectID(req.ProjectID)
	if err != nil {
		h.emit(EventProjectFileSearchResponse, ProjectFileSearchResponse{
			RequestID: req.RequestID,
			Results:   []ProjectFileMatch{},
		})
		return
	}

	matches, err := provider.Projects().FileSearch(context.Background(), opencodeProjectID, req.Query, req.Limit)
	if err != nil {
		h.emit(EventProjectFileSearchResponse, ProjectFileSearchResponse{
			RequestID: req.RequestID,
			Results:   []ProjectFileMatch{},
		})
		return
	}

	results := make([]ProjectFileMatch, 0, len(matches))
	for _, m := range matches {
		results = append(results, ProjectFileMatch{
			Name: m.Name,
			Path: m.Path,
			Type: m.Type,
		})
	}

	h.emit(EventProjectFileSearchResponse, ProjectFileSearchResponse{
		RequestID: req.RequestID,
		Results:   results,
	})
}

func (h *Handler) handleProjectBranches(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectBranchesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_branches_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.ListBranches(false)
	if !result.Success {
		h.emitError(req.RequestID, "LIST_BRANCHES_ERROR", result.Error)
		return
	}

	branches := make([]BranchInfo, 0, len(result.Data))
	for _, b := range result.Data {
		if !b.IsRemote {
			branches = append(branches, BranchInfo{
				Name:      b.Name,
				IsCurrent: b.IsCurrent,
			})
		}
	}

	h.emit(EventProjectBranchesResponse, ProjectBranchesResponse{
		RequestID: req.RequestID,
		Branches:  branches,
	})
}

func (h *Handler) handleProjectBranchSwitch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProjectBranchSwitchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse project_branch_switch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.SwitchBranch(req.Branch)
	if !result.Success {
		h.emitError(req.RequestID, "SWITCH_BRANCH_ERROR", result.Error)
		return
	}

	h.emit(EventProjectBranchSwitchResponse, ProjectBranchSwitchResponse{
		RequestID: req.RequestID,
		Success:   true,
	})
}

func (h *Handler) handleSessionsList(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionsListRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse sessions_list_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	h.logger.Printf("[sessions-debug] sessions list request: %v", req.Cwd)

	filters := agent.SessionFilters{
		Cwd:    req.Cwd,
		Status: req.Status,
		Limit:  req.Limit,
	}

	sessions, _, err := provider.Sessions().List(context.Background(), filters)
	if err != nil {
		h.emit(EventSessionsListResponse, SessionsListResponse{
			RequestID: req.RequestID,
			Sessions:  []SessionPayload{},
		})
		return
	}

	payload := SessionsListResponse{
		RequestID: req.RequestID,
		Sessions:  make([]SessionPayload, 0, len(sessions)),
	}
	for _, s := range sessions {
		payload.Sessions = append(payload.Sessions, h.convertSession(s))
	}

	h.emit(EventSessionsListResponse, payload)
}

func (h *Handler) handleSessionGet(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionGetRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_get_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	session, err := provider.Sessions().Get(context.Background(), req.SessionID)
	if err != nil || session == nil {
		h.emit(EventSessionGetResponse, SessionGetResponse{
			RequestID: req.RequestID,
			Session:   nil,
		})
		return
	}

	h.emit(EventSessionGetResponse, SessionGetResponse{
		RequestID: req.RequestID,
		Session:   h.convertSessionPtr(session),
	})
}

func (h *Handler) handleSessionMessages(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionMessagesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_messages_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	envelopes, err := provider.Sessions().Messages(context.Background(), req.SessionID, req.Limit)
	if err != nil {
		h.emit(EventSessionMessagesResponse, SessionMessagesResponse{
			RequestID: req.RequestID,
			Envelopes: []EnvelopePayload{},
		})
		return
	}

	h.emit(EventSessionMessagesResponse, SessionMessagesResponse{
		RequestID: req.RequestID,
		Envelopes: envelopes,
	})
}

func (h *Handler) handleSessionCreate(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionCreateRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_create_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	directory := ""
	if req.ProjectID != "" {
		if workspaceItem, err := h.resolveWorkspace(req.ProjectID); err == nil && workspaceItem != nil {
			directory = workspaceItem.Directory
		}
	}

	session, err := provider.Sessions().Create(context.Background(), directory)
	if err != nil {
		h.emitError(req.RequestID, "SESSION_CREATE_ERROR", err.Error())
		return
	}

	h.emit(EventSessionCreateResponse, SessionCreateResponse{
		RequestID: req.RequestID,
		Session:   h.convertSession(*session),
	})
}

func (h *Handler) handleSessionDiff(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionDiffRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_diff_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	diffs, err := provider.Sessions().Diff(context.Background(), req.SessionID, "")
	if err != nil {
		h.emit(EventSessionDiffResponse, SessionDiffResponse{
			RequestID: req.RequestID,
			Diffs:     []FileDiff{},
		})
		return
	}

	result := make([]FileDiff, 0, len(diffs))
	for _, d := range diffs {
		result = append(result, FileDiff{
			File:      d.File,
			Before:    d.Before,
			After:     d.After,
			Additions: d.Additions,
			Deletions: d.Deletions,
			Patch:     d.Patch,
		})
	}

	h.emit(EventSessionDiffResponse, SessionDiffResponse{
		RequestID: req.RequestID,
		Diffs:     result,
	})
}

func (h *Handler) handleSessionUpdate(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionUpdateRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_update_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	session, err := provider.Sessions().Get(context.Background(), req.SessionID)
	if err != nil || session == nil {
		h.emit(EventSessionUpdateResponse, SessionUpdateResponse{
			RequestID: req.RequestID,
			Session:   nil,
		})
		return
	}

	h.emit(EventSessionUpdateResponse, SessionUpdateResponse{
		RequestID: req.RequestID,
		Session:   h.convertSessionPtr(session),
	})
}

func (h *Handler) handleSessionPromptRequest(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionPromptRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_prompt_request: %v", err)
		return
	}

	h.emit(EventSessionPromptStarted, SessionPromptStarted{
		RequestID: req.RequestID,
		ProjectID: req.ProjectID,
		SessionID: req.SessionID,
	})

	provider, err := h.getProvider()
	if err != nil {
		h.emit(EventSessionPromptResponse, SessionPromptResponsePayload{
			RequestID: req.RequestID,
			ProjectID: req.ProjectID,
			SessionID: req.SessionID,
			Success:   false,
			Error:     err.Error(),
			ExitCode:  -1,
			Duration:  0,
		})
		return
	}

	directory := ""
	if req.ProjectID != "" {
		if workspaceItem, err := h.resolveWorkspace(req.ProjectID); err == nil && workspaceItem != nil {
			directory = workspaceItem.Directory
		}
	}

	runInput := agent.RunInput{
		Prompt:     req.Prompt,
		SessionID:  req.SessionID,
		ProjectID:  req.ProjectID,
		WorkingDir: directory,
		Agent:      req.Agent,
	}
	if req.Model != nil {
		runInput.Model = &agent.ModelRef{
			ProviderID: req.Model.ProviderID,
			ModelID:    req.Model.ModelID,
		}
	}

	result, err := provider.Sessions().RunStream(context.Background(), runInput, func(chunk agent.StreamChunk) {
		h.emit(EventSessionStreamChunk, SessionStreamChunkPayload{
			RequestID:  req.RequestID,
			ProjectID:  req.ProjectID,
			SessionID:  req.SessionID,
			MessageID:  chunk.MessageID,
			Chunk:      chunk.Content,
			Type:       chunk.Type,
			IsComplete: chunk.IsComplete,
		})
	})

	response := SessionPromptResponsePayload{
		RequestID: req.RequestID,
		ProjectID: req.ProjectID,
		SessionID: req.SessionID,
	}

	if err != nil {
		response.Success = false
		response.Error = err.Error()
		response.ExitCode = -1
		response.Duration = 0
	} else {
		response.Success = result.Success
		response.Output = result.Output
		response.Error = result.Error
		response.ExitCode = result.ExitCode
		response.Duration = int(result.Duration.Milliseconds())
		response.SessionID = result.SessionID
	}

	h.emit(EventSessionPromptResponse, response)
}

func (h *Handler) handleSessionAbort(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SessionAbortPayload
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse session_abort: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emit(EventSessionAborted, SessionAbortedPayload{
			RequestID: req.RequestID,
			SessionID: req.SessionID,
			Success:   false,
			Error:     err.Error(),
		})
		return
	}

	aborted, err := provider.Sessions().Abort(context.Background(), req.SessionID, "")
	if err != nil {
		h.emit(EventSessionAborted, SessionAbortedPayload{
			RequestID: req.RequestID,
			SessionID: req.SessionID,
			Success:   false,
			Error:     err.Error(),
		})
		return
	}

	h.emit(EventSessionAborted, SessionAbortedPayload{
		RequestID: req.RequestID,
		SessionID: req.SessionID,
		Success:   aborted,
	})
}

func (h *Handler) handleProvidersList(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req ProvidersListRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse providers_list_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	providers, err := provider.Providers().List(context.Background())
	if err != nil {
		h.emit(EventProvidersListResponse, ProvidersListResponse{
			RequestID: req.RequestID,
			Providers: []ProviderPayload{},
		})
		return
	}

	payload := ProvidersListResponse{
		RequestID: req.RequestID,
		Providers: make([]ProviderPayload, 0, len(providers)),
	}
	for _, p := range providers {
		models := make([]ModelPayload, 0, len(p.Models))
		for _, m := range p.Models {
			models = append(models, ModelPayload{ID: m.ID, Name: m.Name})
		}
		payload.Providers = append(payload.Providers, ProviderPayload{
			ID:     p.ID,
			Name:   p.Name,
			Models: models,
		})
	}

	h.emit(EventProvidersListResponse, payload)
}

func (h *Handler) handleAgentsList(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req AgentsListRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse agents_list_request: %v", err)
		return
	}

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	directory := req.Directory
	if directory == "" && req.ProjectID != "" {
		workspaceItem, err := h.resolveWorkspace(req.ProjectID)
		if err != nil {
			h.emit(EventAgentsListResponse, AgentsListResponse{
				RequestID: req.RequestID,
				Agents:    []AgentPayload{},
			})
			return
		}
		if workspaceItem != nil {
			directory = workspaceItem.Directory
		}
	}

	agents, err := provider.Agents().List(context.Background(), directory)
	if err != nil {
		h.emit(EventAgentsListResponse, AgentsListResponse{
			RequestID: req.RequestID,
			Agents:    []AgentPayload{},
		})
		return
	}

	payload := AgentsListResponse{
		RequestID: req.RequestID,
		Agents:    make([]AgentPayload, 0, len(agents)),
	}
	for _, item := range agents {
		if item.Hidden {
			continue
		}
		var model *ModelRefJSON
		if item.Model != nil {
			model = &ModelRefJSON{
				ProviderID: item.Model.ProviderID,
				ModelID:    item.Model.ModelID,
			}
		}
		payload.Agents = append(payload.Agents, AgentPayload{
			Name:        item.Name,
			Description: item.Description,
			Mode:        item.Mode,
			BuiltIn:     item.BuiltIn,
			Model:       model,
		})
	}

	h.emit(EventAgentsListResponse, payload)
}

func (h *Handler) handleGitStagedFiles(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitStagedFilesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_staged_files_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emit(EventGitStagedFilesResponse, GitStagedFilesResponse{
			RequestID: req.RequestID,
			Staged:    []GitFile{},
			Unstaged:  []GitFile{},
			Branch:    "HEAD",
		})
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.GetFileStatusLists()

	staged := make([]GitFile, 0, len(result.Data.Staged))
	for _, f := range result.Data.Staged {
		staged = append(staged, GitFile{Path: f.Path, Status: f.Status})
	}
	unstaged := make([]GitFile, 0, len(result.Data.Unstaged))
	for _, f := range result.Data.Unstaged {
		unstaged = append(unstaged, GitFile{Path: f.Path, Status: f.Status})
	}

	h.emit(EventGitStagedFilesResponse, GitStagedFilesResponse{
		RequestID: req.RequestID,
		Staged:    staged,
		Unstaged:  unstaged,
		Branch:    result.Data.Branch,
	})
}

func (h *Handler) handleGitStageFiles(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitStageFilesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_stage_files_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emit(EventGitStageFilesResponse, GitStageFilesResponse{
			RequestID: req.RequestID,
			Success:   false,
		})
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.AddFiles(req.Files)

	h.emit(EventGitStageFilesResponse, GitStageFilesResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
	})
}

func (h *Handler) handleGitUnstageFiles(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitUnstageFilesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_unstage_files_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emit(EventGitUnstageFilesResponse, GitUnstageFilesResponse{
			RequestID: req.RequestID,
			Success:   false,
		})
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.UnstageFiles(req.Files)

	h.emit(EventGitUnstageFilesResponse, GitUnstageFilesResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
	})
}

func (h *Handler) handleGitFileDiff(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitFileDiffRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_file_diff_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emit(EventGitFileDiffResponse, GitFileDiffResponse{
			RequestID: req.RequestID,
			Files:     []GitDiff{},
			Success:   false,
			Error:     err.Error(),
		})
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.DiffFile(req.FilePath)

	files := make([]GitDiff, 0, len(result.Data))
	for _, fd := range result.Data {
		hunks := make([]GitDiffHunk, 0, len(fd.Hunks))
		for _, hk := range fd.Hunks {
			lines := make([]GitDiffLine, 0, len(hk.Lines))
			for _, ln := range hk.Lines {
				lines = append(lines, GitDiffLine{
					Type:    ln.Type,
					Content: ln.Content,
				})
			}
			hunks = append(hunks, GitDiffHunk{
				Header: hk.Header,
				Lines:  lines,
			})
		}
		files = append(files, GitDiff{
			FileName: fd.FileName,
			Hunks:    hunks,
		})
	}

	h.emit(EventGitFileDiffResponse, GitFileDiffResponse{
		RequestID: req.RequestID,
		Files:     files,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitDiscardFile(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitDiscardFileRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_discard_file_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emit(EventGitDiscardFileResponse, GitDiscardFileResponse{
			RequestID: req.RequestID,
			Success:   false,
		})
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.DiscardChanges([]string{req.FilePath})

	h.emit(EventGitDiscardFileResponse, GitDiscardFileResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
	})
}

func (h *Handler) handleGitLog(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitLogRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_log_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Log(req.Count)
	if !result.Success {
		h.emitError(req.RequestID, "GIT_LOG_ERROR", result.Error)
		return
	}

	commits := make([]GitCommitInfo, 0, len(result.Data))
	for _, c := range result.Data {
		commits = append(commits, GitCommitInfo{
			Hash:      c.Hash,
			ShortHash: c.ShortHash,
			Author:    c.Author,
			Date:      c.Date,
			Message:   c.Message,
		})
	}

	h.emit(EventGitLogResponse, GitLogResponse{
		RequestID: req.RequestID,
		Commits:   commits,
	})
}

func (h *Handler) handleGitGetCurrentBranch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitGetCurrentBranchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_get_current_branch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.GetCurrentBranch()

	h.emit(EventGitGetCurrentBranchResponse, GitGetCurrentBranchResponse{
		RequestID: req.RequestID,
		Branch:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitListBranches(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitListBranchesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_list_branches_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.ListBranches(req.IncludeRemote)
	if !result.Success {
		h.emitError(req.RequestID, "GIT_LIST_BRANCHES_ERROR", result.Error)
		return
	}

	branches := make([]BranchInfo, 0, len(result.Data))
	for _, b := range result.Data {
		branches = append(branches, BranchInfo{
			Name:      b.Name,
			IsCurrent: b.IsCurrent,
		})
	}

	h.emit(EventGitListBranchesResponse, GitListBranchesResponse{
		RequestID: req.RequestID,
		Branches:  branches,
	})
}

func (h *Handler) handleGitCreateBranch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitCreateBranchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_create_branch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.CreateBranch(req.Name, req.StartPoint)

	h.emit(EventGitCreateBranchResponse, GitCreateBranchResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Branch:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitDeleteBranch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitDeleteBranchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_delete_branch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.DeleteBranch(req.Name, req.Force)

	h.emit(EventGitDeleteBranchResponse, GitDeleteBranchResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitSwitchBranch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitSwitchBranchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_switch_branch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.SwitchBranch(req.Branch)

	h.emit(EventGitSwitchBranchResponse, GitSwitchBranchResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Branch:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitCommit(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitCommitRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_commit_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Commit(req.Message)

	h.emit(EventGitCommitResponse, GitCommitResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Hash:      result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitPush(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitPushRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_push_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	remote := req.Remote
	if remote == "" {
		remote = "origin"
	}
	result := svc.Push(remote, req.Branch, req.SetUpstream)

	h.emit(EventGitPushResponse, GitPushResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitPull(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitPullRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_pull_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	remote := req.Remote
	if remote == "" {
		remote = "origin"
	}
	result := svc.Pull(remote, req.Branch)

	h.emit(EventGitPullResponse, GitPullResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitFetch(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitFetchRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_fetch_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	remote := req.Remote
	if remote == "" {
		remote = "origin"
	}
	result := svc.Fetch(remote)

	h.emit(EventGitFetchResponse, GitFetchResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitGetRemotes(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitGetRemotesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_get_remotes_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.GetRemotes()
	if !result.Success {
		h.emitError(req.RequestID, "GIT_GET_REMOTES_ERROR", result.Error)
		return
	}

	remotes := make([]GitRemoteInfo, 0, len(result.Data))
	for _, r := range result.Data {
		remotes = append(remotes, GitRemoteInfo{
			Name:     r.Name,
			FetchURL: r.FetchURL,
			PushURL:  r.PushURL,
		})
	}

	h.emit(EventGitGetRemotesResponse, GitGetRemotesResponse{
		RequestID: req.RequestID,
		Remotes:   remotes,
	})
}

func (h *Handler) handleGitAddRemote(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitAddRemoteRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_add_remote_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.AddRemote(req.Name, req.URL)

	h.emit(EventGitAddRemoteResponse, GitAddRemoteResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitRemoveRemote(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitRemoveRemoteRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_remove_remote_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.RemoveRemote(req.Name)

	h.emit(EventGitRemoveRemoteResponse, GitRemoveRemoteResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitDiffStaged(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitDiffStagedRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_diff_staged_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.DiffStaged()

	h.emit(EventGitDiffStagedResponse, GitDiffStagedResponse{
		RequestID: req.RequestID,
		Diff:      result.Data,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitDiffUnstaged(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitDiffUnstagedRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_diff_unstaged_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.DiffUnstaged()

	h.emit(EventGitDiffUnstagedResponse, GitDiffUnstagedResponse{
		RequestID: req.RequestID,
		Diff:      result.Data,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitGetFileContent(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitGetFileContentRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_get_file_content_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.GetFileContent(req.FilePath)

	h.emit(EventGitGetFileContentResponse, GitGetFileContentResponse{
		RequestID: req.RequestID,
		Content:   result.Data,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitStash(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitStashRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_stash_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Stash(req.Message)

	h.emit(EventGitStashResponse, GitStashResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitStashPop(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitStashPopRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_stash_pop_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.StashPop()

	h.emit(EventGitStashPopResponse, GitStashPopResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitMerge(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitMergeRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_merge_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Merge(req.Branch, req.Message)

	h.emit(EventGitMergeResponse, GitMergeResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitRebase(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitRebaseRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_rebase_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Rebase(req.Branch)

	h.emit(EventGitRebaseResponse, GitRebaseResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitRebaseAbort(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitRebaseAbortRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_rebase_abort_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.RebaseAbort()

	h.emit(EventGitRebaseAbortResponse, GitRebaseAbortResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitCreateTag(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitCreateTagRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_create_tag_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.CreateTag(req.Name, req.Message)

	h.emit(EventGitCreateTagResponse, GitCreateTagResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Name:      result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitListTags(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitListTagsRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_list_tags_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.ListTags()

	h.emit(EventGitListTagsResponse, GitListTagsResponse{
		RequestID: req.RequestID,
		Tags:      result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitReset(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitResetRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_reset_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.Reset(req.Mode, req.Ref)

	h.emit(EventGitResetResponse, GitResetResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handleGitAddAll(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitAddAllRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_add_all_request: %v", err)
		return
	}

	worktree, err := h.resolveWorktree(req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "PROJECT_NOT_FOUND", err.Error())
		return
	}

	svc := gitservice.NewService(worktree)
	result := svc.AddAll()

	h.emit(EventGitAddAllResponse, GitAddAllResponse{
		RequestID: req.RequestID,
		Success:   result.Success,
		Output:    result.Data,
		Error:     result.Error,
	})
}

func (h *Handler) handlePermissionResponse(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var resp PermissionResponsePayload
	if err := json.Unmarshal(args[0], &resp); err != nil {
		h.logger.Printf("relay: failed to parse permission_response: %v", err)
		return
	}

	h.mu.Lock()
	ch, ok := h.pendingPermissions[resp.RequestID]
	if ok {
		delete(h.pendingPermissions, resp.RequestID)
	}
	h.mu.Unlock()

	if ok {
		ch <- PermissionReply{Reply: resp.Reply}
	}
}

func (h *Handler) handleQuestionResponse(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var resp QuestionResponsePayload
	if err := json.Unmarshal(args[0], &resp); err != nil {
		h.logger.Printf("relay: failed to parse question_response: %v", err)
		return
	}

	h.mu.Lock()
	ch, ok := h.pendingQuestions[resp.RequestID]
	if ok {
		delete(h.pendingQuestions, resp.RequestID)
	}
	h.mu.Unlock()

	if ok {
		ch <- QuestionReply{Answers: resp.Answers}
	}
}

func (h *Handler) RequestPermission(payload PermissionRequestPayload) (string, error) {
	ch := make(chan PermissionReply, 1)
	h.mu.Lock()
	h.pendingPermissions[payload.RequestID] = ch
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.pendingPermissions, payload.RequestID)
		h.mu.Unlock()
	}()

	h.emit(EventPermissionRequest, payload)

	select {
	case reply := <-ch:
		return reply.Reply, nil
	case <-h.client.ctx.Done():
		return "", fmt.Errorf("context cancelled")
	case <-time.After(120 * time.Second):
		return "", fmt.Errorf("permission request timed out")
	}
}

func (h *Handler) RequestQuestion(payload QuestionRequestPayload) ([][]string, error) {
	ch := make(chan QuestionReply, 1)
	h.mu.Lock()
	h.pendingQuestions[payload.RequestID] = ch
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.pendingQuestions, payload.RequestID)
		h.mu.Unlock()
	}()

	h.emit(EventQuestionRequest, payload)

	select {
	case reply := <-ch:
		return reply.Answers, nil
	case <-h.client.ctx.Done():
		return nil, fmt.Errorf("context cancelled")
	case <-time.After(120 * time.Second):
		return nil, fmt.Errorf("question request timed out")
	}
}

func (h *Handler) convertSession(s agent.Session) SessionPayload {
	sp := SessionPayload{
		ID:        s.ID,
		ProjectID: s.ProjectID,
		Directory: s.Directory,
		Prompt:    s.Title,
		Status:    string(s.Status),
		CreatedAt: s.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt: s.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	if s.Output != "" {
		sp.Output = s.Output
	}
	if s.Error != "" {
		sp.Error = s.Error
	}
	if s.ExitCode != nil {
		sp.ExitCode = s.ExitCode
	}
	if s.DurationMs != nil {
		dur := int(*s.DurationMs)
		sp.Duration = &dur
	}
	if s.StartedAt != nil {
		sp.StartedAt = s.StartedAt.Format("2006-01-02T15:04:05.000Z")
	}
	if s.EndedAt != nil {
		sp.CompletedAt = s.EndedAt.Format("2006-01-02T15:04:05.000Z")
	}
	return sp
}

func (h *Handler) convertSessionPtr(s *agent.Session) *SessionPayload {
	if s == nil {
		return nil
	}
	sp := h.convertSession(*s)
	return &sp
}

func (h *Handler) getSkillsService() (agent.SkillsService, error) {
	provider, err := h.getProvider()
	if err != nil {
		return nil, err
	}
	svc := provider.Skills()
	if svc == nil {
		return nil, fmt.Errorf("skills not supported by provider")
	}
	return svc, nil
}

func (h *Handler) handleSkillsList(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req SkillsListRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse skills_list_request: %v", err)
		return
	}

	skillsSvc, err := h.getSkillsService()
	if err != nil {
		h.emitError(req.RequestID, "SKILLS_ERROR", err.Error())
		return
	}

	directory := ""
	if req.ProjectID != "" {
		workspaceItem, err := h.resolveWorkspace(req.ProjectID)
		if err == nil && workspaceItem != nil {
			directory = workspaceItem.Directory
		}
	}

	skills, err := skillsSvc.List(context.Background(), directory, req.Query)
	if err != nil {
		h.emit(EventSkillsListResponse, SkillsListResponse{
			RequestID: req.RequestID,
			Skills:    []SkillPayload{},
		})
		return
	}

	payload := SkillsListResponse{
		RequestID: req.RequestID,
		Skills:    make([]SkillPayload, 0, len(skills)),
	}
	for _, s := range skills {
		payload.Skills = append(payload.Skills, SkillPayload{
			Name:        s.Name,
			Description: s.Description,
			Source:      s.Source,
		})
	}

	h.emit(EventSkillsListResponse, payload)
}
