package git

import (
	"net/http"
	"strconv"

	"relaid/internal/agent"
	gitservice "relaid/internal/git"
	"relaid/internal/shared/httpresponse"

	"github.com/labstack/echo/v4"
)

type RegistryProvider interface {
	Get(id agent.ProviderID) (agent.AgentProvider, error)
}

func Register(api *echo.Group, registry RegistryProvider) {
	api.GET("/:projectId/staged", getFileStatusLists(registry))
	api.POST("/:projectId/stage", addFiles(registry))
	api.POST("/:projectId/unstage", unstageFiles(registry))
	api.GET("/:projectId/diff", diffFile(registry))
	api.POST("/:projectId/discard", discardChanges(registry))

	api.GET("/:projectId/addAll", addAllFiles(registry))
	api.GET("/:projectId/branches", listBranches(registry))
	api.POST("/:projectId/branches/switch", switchBranch(registry))
	api.GET("/:projectId/current-branch", getCurrentBranch(registry))
	api.POST("/:projectId/commit", commit(registry))
	api.POST("/:projectId/push", push(registry))
	api.POST("/:projectId/pull", pull(registry))
	api.POST("/:projectId/fetch", fetch(registry))
	api.GET("/:projectId/remotes", getRemotes(registry))
	api.POST("/:projectId/remotes/add", addRemote(registry))
	api.POST("/:projectId/remotes/remove", removeRemote(registry))
	api.GET("/:projectId/diff/staged", diffStaged(registry))
	api.GET("/:projectId/diff/unstaged", diffUnstaged(registry))
	api.GET("/:projectId/log", log(registry))
	api.GET("/:projectId/file-content", getFileContent(registry))
	api.POST("/:projectId/stash", stash(registry))
	api.POST("/:projectId/stash/pop", stashPop(registry))
	api.POST("/:projectId/merge", merge(registry))
	api.POST("/:projectId/rebase", rebase(registry))
	api.POST("/:projectId/rebase/abort", rebaseAbort(registry))
	api.POST("/:projectId/tags", createTag(registry))
	api.GET("/:projectId/tags", listTags(registry))
	api.POST("/:projectId/reset", reset(registry))
	api.POST("/:projectId/branches/create", createBranch(registry))
	api.POST("/:projectId/branches/delete", deleteBranch(registry))
}

func resolveWorktree(registry RegistryProvider, c echo.Context) (string, error) {
	projectID := c.Param("projectId")
	provider, err := registry.Get(agent.ProviderOpencode)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusNotFound, "Provider not found")
	}
	project, err := provider.Projects().Get(c.Request().Context(), projectID)
	if err != nil || project == nil {
		return "", echo.NewHTTPError(http.StatusNotFound, "Project not found")
	}
	return project.Worktree, nil
}

func getFileStatusLists(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.GetFileStatusLists()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"staged":   result.Data.Staged,
			"unstaged": result.Data.Unstaged,
			"branch":   result.Data.Branch,
		}, "File status fetched successfully")
	}
}

func addFiles(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Files []string `json:"files"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.AddFiles(body.Files)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success":  true,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Files staged successfully")
	}
}

func unstageFiles(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Files []string `json:"files"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.UnstageFiles(body.Files)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success":  true,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Files unstaged successfully")
	}
}

func diffFile(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		filePath := c.QueryParam("filePath")
		svc := gitservice.NewService(worktree)
		result := svc.DiffFile(filePath)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"files":   result.Data,
			"success": true,
		}, "Diff fetched successfully")
	}
}

func discardChanges(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			FilePath string   `json:"filePath"`
			Files    []string `json:"files"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		files := body.Files
		if len(files) == 0 && body.FilePath != "" {
			files = []string{body.FilePath}
		}
		svc := gitservice.NewService(worktree)
		result := svc.DiscardChanges(files)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success": true,
		}, result.Data)
	}
}

func addAllFiles(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.AddAll()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success":  true,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "All changes staged successfully")
	}
}

func listBranches(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.ListBranches(false)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		type branchInfo struct {
			Name      string `json:"name"`
			IsCurrent bool   `json:"isCurrent"`
		}
		branches := make([]branchInfo, 0, len(result.Data))
		for _, b := range result.Data {
			if !b.IsRemote {
				branches = append(branches, branchInfo{
					Name:      b.Name,
					IsCurrent: b.IsCurrent,
				})
			}
		}
		return httpresponse.Success(c, map[string]any{
			"branches": branches,
		}, "Branches fetched successfully")
	}
}

func switchBranch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Branch string `json:"branch"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.SwitchBranch(body.Branch)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"branch": result.Data,
		}, "Branch switched successfully")
	}
}

func getCurrentBranch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.GetCurrentBranch()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"branch": result.Data,
		}, "Current branch fetched successfully")
	}
}

func createBranch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Name       string `json:"name"`
			StartPoint string `json:"startPoint"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.CreateBranch(body.Name, body.StartPoint)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"branch": result.Data,
		}, "Branch created successfully")
	}
}

func deleteBranch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Name  string `json:"name"`
			Force bool   `json:"force"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.DeleteBranch(body.Name, body.Force)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success": true,
		}, "Branch deleted successfully")
	}
}

func commit(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Message string   `json:"message"`
			Files   []string `json:"files"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.Commit(body.Message, body.Files)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"hash":     result.Data.Hash,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Commit created successfully")
	}
}

func push(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Remote      string `json:"remote"`
			Branch      string `json:"branch"`
			SetUpstream bool   `json:"setUpstream"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		remote := body.Remote
		if remote == "" {
			remote = "origin"
		}
		result := svc.Push(remote, body.Branch, body.SetUpstream)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output":   result.Data.Output,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Push completed successfully")
	}
}

func pull(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Remote string `json:"remote"`
			Branch string `json:"branch"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		remote := body.Remote
		if remote == "" {
			remote = "origin"
		}
		result := svc.Pull(remote, body.Branch)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output":   result.Data.Output,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Pull completed successfully")
	}
}

func fetch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Remote string `json:"remote"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		remote := body.Remote
		if remote == "" {
			remote = "origin"
		}
		result := svc.Fetch(remote)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output":   result.Data.Output,
			"staged":   result.Data.Status.Staged,
			"unstaged": result.Data.Status.Unstaged,
			"branch":   result.Data.Status.Branch,
		}, "Fetch completed successfully")
	}
}

func getRemotes(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.GetRemotes()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"remotes": result.Data,
		}, "Remotes fetched successfully")
	}
}

func addRemote(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.AddRemote(body.Name, body.URL)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success": true,
		}, "Remote added successfully")
	}
}

func removeRemote(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.RemoveRemote(body.Name)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success": true,
		}, "Remote removed successfully")
	}
}

func diffStaged(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.DiffStaged()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"diff":    result.Data,
			"success": true,
		}, "Staged diff fetched successfully")
	}
}

func diffUnstaged(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.DiffUnstaged()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"diff":    result.Data,
			"success": true,
		}, "Unstaged diff fetched successfully")
	}
}

func log(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		count := 10
		if raw := c.QueryParam("count"); raw != "" {
			if parsed, e := strconv.Atoi(raw); e == nil && parsed > 0 {
				count = parsed
			}
		}
		svc := gitservice.NewService(worktree)
		result := svc.Log(count)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"commits": result.Data,
		}, "Log fetched successfully")
	}
}

func getFileContent(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		filePath := c.QueryParam("filePath")
		svc := gitservice.NewService(worktree)
		result := svc.GetFileContent(filePath)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"content": result.Data,
		}, "File content fetched successfully")
	}
}

func stash(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Message string `json:"message"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.Stash(body.Message)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output": result.Data,
		}, "Stash completed successfully")
	}
}

func stashPop(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.StashPop()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output": result.Data,
		}, "Stash pop completed successfully")
	}
}

func merge(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Branch  string `json:"branch"`
			Message string `json:"message"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.Merge(body.Branch, body.Message)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output": result.Data,
		}, "Merge completed successfully")
	}
}

func rebase(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Branch string `json:"branch"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.Rebase(body.Branch)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output": result.Data,
		}, "Rebase completed successfully")
	}
}

func rebaseAbort(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.RebaseAbort()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"success": true,
		}, "Rebase aborted successfully")
	}
}

func createTag(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Name    string `json:"name"`
			Message string `json:"message"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.CreateTag(body.Name, body.Message)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"name": result.Data,
		}, "Tag created successfully")
	}
}

func listTags(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		svc := gitservice.NewService(worktree)
		result := svc.ListTags()
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"tags": result.Data,
		}, "Tags fetched successfully")
	}
}

func reset(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(registry, c)
		if err != nil {
			return err
		}
		var body struct {
			Mode string `json:"mode"`
			Ref  string `json:"ref"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		svc := gitservice.NewService(worktree)
		result := svc.Reset(body.Mode, body.Ref)
		if !result.Success {
			return echo.NewHTTPError(http.StatusInternalServerError, result.Error)
		}
		return httpresponse.Success(c, map[string]any{
			"output": result.Data,
		}, "Reset completed successfully")
	}
}
