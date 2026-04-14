package projects

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
	api.GET("/:projectId/branches", listBranches(registry))
	api.POST("/:projectId/branches/switch", switchBranch(registry))
	api.GET("/:projectId/file-search", fileSearch(registry))
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

func fileSearch(registry RegistryProvider) echo.HandlerFunc {
	return func(c echo.Context) error {
		projectID := c.Param("projectId")
		provider, err := registry.Get(agent.ProviderOpencode)
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

		matches, err := provider.Projects().FileSearch(c.Request().Context(), projectID, query, limit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		return httpresponse.Success(c, map[string]any{
			"results": matches,
		}, "File search completed")
	}
}
