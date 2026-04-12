package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"sync"
	"time"

	"relaid/internal/agent"
)

type Handler struct {
	client   *Client
	registry *agent.Registry
	logger   *log.Logger

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

func NewHandler(client *Client, registry *agent.Registry, logger *log.Logger) *Handler {
	return &Handler{
		client:             client,
		registry:           registry,
		logger:             logger,
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
	case EventPermissionResponse:
		go h.handlePermissionResponse(args)
	case EventQuestionResponse:
		go h.handleQuestionResponse(args)

	// Response events — handled by the relay server or other clients, ignore here
	case EventProjectsListResponse,
		EventProjectGetResponse,
		EventProjectDirectoryResponse,
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
		EventGitStagedFilesResponse,
		EventGitStageFilesResponse,
		EventGitUnstageFilesResponse,
		EventGitFileDiffResponse,
		EventGitDiscardFileResponse,
		EventErrorResponse:
		// silently ignore response events
	default:
		h.logger.Printf("relay: unhandled event: %s", event)
	}
}

func (h *Handler) getProvider() (agent.AgentProvider, error) {
	return h.registry.Get(agent.ProviderOpencode)
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

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	h.logger.Printf("relay: provider: %v", provider)

	projects, err := provider.Projects().List(context.Background())
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
		name := p.ID
		if p.Worktree != "" {
			name = filepath.Base(p.Worktree)
		}
		pp := ProjectPayload{
			ID:        p.ID,
			Name:      name,
			Folder:    p.Worktree,
			CreatedAt: p.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
			UpdatedAt: p.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		}
		if p.Initialized != nil {
			pp.UpdatedAt = p.Initialized.Format("2006-01-02T15:04:05.000Z")
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

	provider, err := h.getProvider()
	if err != nil {
		h.emitError(req.RequestID, "PROVIDER_ERROR", err.Error())
		return
	}

	project, err := provider.Projects().Get(context.Background(), req.ProjectID)
	if err != nil || project == nil {
		h.emit(EventProjectGetResponse, ProjectGetResponse{
			RequestID: req.RequestID,
			Project:   nil,
		})
		return
	}

	name := project.ID
	if project.Worktree != "" {
		name = filepath.Base(project.Worktree)
	}
	pp := &ProjectPayload{
		ID:        project.ID,
		Name:      name,
		Folder:    project.Worktree,
		CreatedAt: project.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt: project.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	if project.Initialized != nil {
		pp.UpdatedAt = project.Initialized.Format("2006-01-02T15:04:05.000Z")
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

	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "project directory not yet implemented")
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

	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "project file search not yet implemented")
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

	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git branches not yet implemented")
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

	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git branch switch not yet implemented")
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

	filters := agent.SessionFilters{
		ProjectID: req.ProjectID,
		Status:    req.Status,
		Limit:     req.Limit,
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
		payload.Sessions = append(payload.Sessions, convertSession(s))
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
		Session:   convertSessionPtr(session),
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

	h.logger.Printf("relay: session envelopes: %v", len(envelopes))

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

	session, err := provider.Sessions().Create(context.Background(), req.ProjectID)
	if err != nil {
		h.emitError(req.RequestID, "SESSION_CREATE_ERROR", err.Error())
		return
	}

	h.emit(EventSessionCreateResponse, SessionCreateResponse{
		RequestID: req.RequestID,
		Session:   convertSession(*session),
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
		Session:   convertSessionPtr(session),
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

	runInput := agent.RunInput{
		Prompt:    req.Prompt,
		SessionID: req.SessionID,
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
			SessionID: req.SessionID,
			Success:   false,
			Error:     err.Error(),
		})
		return
	}

	aborted, err := provider.Sessions().Abort(context.Background(), req.SessionID, "")
	if err != nil {
		h.emit(EventSessionAborted, SessionAbortedPayload{
			SessionID: req.SessionID,
			Success:   false,
			Error:     err.Error(),
		})
		return
	}

	h.emit(EventSessionAborted, SessionAbortedPayload{
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

func (h *Handler) handleGitStagedFiles(args []json.RawMessage) {
	if len(args) == 0 {
		return
	}
	var req GitStagedFilesRequest
	if err := json.Unmarshal(args[0], &req); err != nil {
		h.logger.Printf("relay: failed to parse git_staged_files_request: %v", err)
		return
	}
	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git operations not yet implemented")
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
	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git operations not yet implemented")
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
	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git operations not yet implemented")
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
	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git operations not yet implemented")
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
	h.emitError(req.RequestID, "NOT_IMPLEMENTED", "git operations not yet implemented")
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

func convertSession(s agent.Session) SessionPayload {
	sp := SessionPayload{
		ID:        s.ID,
		ProjectID: s.ProjectID,
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

func convertSessionPtr(s *agent.Session) *SessionPayload {
	if s == nil {
		return nil
	}
	sp := convertSession(*s)
	return &sp
}
