package projects

import (
	"context"
	"net/http"
	"strconv"

	"relaid/internal/agent"
	gitservice "relaid/internal/git"
	"relaid/internal/shared/httpresponse"
	"relaid/internal/workspace"

	"github.com/labstack/echo/v4"
)

type RegistryProvider interface {
	Get(id agent.ProviderID) (agent.AgentProvider, error)
}

func Register(api *echo.Group, registry RegistryProvider, workspaces *workspace.Service) {
	api.GET("", listWorkspaces(workspaces))
	api.GET("/:projectId", getWorkspace(workspaces))
	api.GET("/:projectId/branches", listBranches(registry, workspaces))
	api.POST("/:projectId/branches/switch", switchBranch(registry, workspaces))
	api.GET("/:projectId/file-search", fileSearch(registry, workspaces))
}

func listWorkspaces(workspaces *workspace.Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		items, err := workspaces.List(c.Request().Context())
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		payload := make([]map[string]any, 0, len(items))
		for _, item := range items {
			payload = append(payload, serializeWorkspace(item))
		}
		return httpresponse.Success(c, map[string]any{"projects": payload}, "Projects fetched successfully")
	}
}

func getWorkspace(workspaces *workspace.Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		item, err := workspaces.GetByKey(c.Request().Context(), c.Param("projectId"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		if item == nil {
			return echo.NewHTTPError(http.StatusNotFound, "Project not found")
		}
		return httpresponse.Success(c, map[string]any{"project": serializeWorkspace(*item)}, "Project fetched successfully")
	}
}

func resolveWorkspace(ctx context.Context, workspaces *workspace.Service, key string) (*workspace.Workspace, error) {
	item, err := workspaces.GetByKey(ctx, key)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if item == nil {
		return nil, echo.NewHTTPError(http.StatusNotFound, "Project not found")
	}
	return item, nil

}

func listBranches(registry RegistryProvider, workspaces *workspace.Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(c.Request().Context(), registry, c.Param("projectId"), workspaces)
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

func switchBranch(registry RegistryProvider, workspaces *workspace.Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		worktree, err := resolveWorktree(c.Request().Context(), registry, c.Param("projectId"), workspaces)
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

func fileSearch(registry RegistryProvider, workspaces *workspace.Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		workspaceItem, err := resolveWorkspace(c.Request().Context(), workspaces, c.Param("projectId"))
		if err != nil {
			return err
		}

		providerID := agent.ProviderID(c.QueryParam("agentProviderId"))
		if providerID == "" {
			providerID = agent.ProviderOpencode
		}

		provider, err := registry.Get(providerID)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "Provider not found")
		}

		query := c.QueryParam("q")
		if query == "" {
			query = c.QueryParam("query")
		}

		limit := 0
		if raw := c.QueryParam("limit"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		searchProjectID := workspaceItem.Directory
		if provider.ID() == agent.ProviderOpencode {
			projectID, err := workspaces.EnsureOpencodeProjectID(c.Request().Context(), provider, workspaceItem)
			if err != nil {
				return echo.NewHTTPError(http.StatusNotFound, err.Error())
			}
			searchProjectID = projectID
		}

		projectService := provider.Projects()
		if projectService == nil {
			return echo.NewHTTPError(http.StatusNotImplemented, "Provider file search is not available")
		}

		matches, err := projectService.FileSearch(c.Request().Context(), searchProjectID, query, limit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		return httpresponse.Success(c, map[string]any{
			"results": matches,
		}, "File search completed")
	}
}

func resolveWorktree(ctx context.Context, registry RegistryProvider, key string, workspaces *workspace.Service) (string, error) {
	if workspaces != nil {
		item, err := resolveWorkspace(ctx, workspaces, key)
		if err != nil {
			return "", err
		}
		return item.Directory, nil
	}

	provider, err := registry.Get(agent.ProviderOpencode)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusNotFound, "Provider not found")
	}
	project, err := provider.Projects().Get(ctx, key)
	if err != nil || project == nil {
		return "", echo.NewHTTPError(http.StatusNotFound, "Project not found")
	}
	return project.Worktree, nil
}

func serializeWorkspace(item workspace.Workspace) map[string]any {
	return map[string]any{
		"id":          item.Key,
		"name":        item.Name,
		"description": item.Description,
		"folder":      item.Directory,
		"directory":   item.Directory,
		"createdAt":   item.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		"updatedAt":   item.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
	}
}
