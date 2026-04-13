package agents

import (
	"errors"
	"net/http"
	"strconv"

	"relaid/internal/agent"
	"relaid/internal/shared/httpresponse"

	"github.com/labstack/echo/v4"
)

type RegistryProvider interface {
	Get(id agent.ProviderID) (agent.AgentProvider, error)
}

func Register(api *echo.Group, registry RegistryProvider) {
	api.GET("/:provider/projects", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().ProjectsList {
			return unsupported(provider, "projects.list")
		}
		projects, err := provider.Projects().List(c.Request().Context())
		if err != nil {
			return err
		}
		payload := make([]agent.ProjectJSON, 0, len(projects))
		for _, project := range projects {
			payload = append(payload, agent.SerializeProject(project))
		}
		return httpresponse.Success(c, map[string]any{"projects": payload}, "Projects fetched successfully")
	})

	api.GET("/:provider/projects/:id", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().ProjectsGet {
			return unsupported(provider, "projects.get")
		}
		project, err := provider.Projects().Get(c.Request().Context(), c.Param("id"))
		if err != nil {
			return err
		}
		if project == nil {
			return httpresponse.JSON(c, http.StatusOK, true, map[string]any{"project": nil}, "Project fetched successfully")
		}
		return httpresponse.Success(c, map[string]any{"project": agent.SerializeProject(*project)}, "Project fetched successfully")
	})

	api.GET("/:provider/sessions", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().SessionsList {
			return unsupported(provider, "sessions.list")
		}
		limit := 50
		if raw := c.QueryParam("limit"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				limit = parsed
			}
		}
		sessions, _, err := provider.Sessions().List(c.Request().Context(), agent.SessionFilters{
			Cwd:    c.QueryParam("cwd"),
			Status: c.QueryParam("status"),
			Limit:  limit,
			Cursor: c.QueryParam("cursor"),
		})
		if err != nil {
			return err
		}
		payload := make([]agent.SessionJSON, 0, len(sessions))
		for _, session := range sessions {
			payload = append(payload, agent.SerializeSession(session))
		}
		return httpresponse.Success(c, map[string]any{"sessions": payload}, "Sessions fetched successfully")
	})

	api.GET("/:provider/sessions/:id", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().SessionsGet {
			return unsupported(provider, "sessions.get")
		}
		session, err := provider.Sessions().Get(c.Request().Context(), c.Param("id"))
		if err != nil {
			return err
		}
		if session == nil {
			return httpresponse.Success(c, map[string]any{"session": nil}, "Session fetched successfully")
		}
		return httpresponse.Success(c, map[string]any{"session": agent.SerializeSession(*session)}, "Session fetched successfully")
	})

	api.GET("/:provider/sessions/:id/diff", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().SessionsDiff {
			return unsupported(provider, "sessions.diff")
		}
		diff, err := provider.Sessions().Diff(c.Request().Context(), c.Param("id"), c.QueryParam("messageId"))
		if err != nil {
			return err
		}
		return httpresponse.Success(c, map[string]any{"diff": diff}, "Session diff fetched successfully")
	})

	api.GET("/:provider/providers", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().ProvidersList {
			return unsupported(provider, "providers.list")
		}
		providers, err := provider.Providers().List(c.Request().Context())
		if err != nil {
			return err
		}
		payload := make([]agent.ProviderJSON, 0, len(providers))
		for _, item := range providers {
			payload = append(payload, agent.SerializeProvider(item))
		}
		return httpresponse.Success(c, map[string]any{"providers": payload}, "Providers fetched successfully")
	})

	api.POST("/:provider/run", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().SessionsRun {
			return unsupported(provider, "sessions.run")
		}
		var body struct {
			Prompt       string          `json:"prompt"`
			WorkingDir   string          `json:"workingDir"`
			SessionID    string          `json:"sessionId"`
			SystemPrompt string          `json:"systemPrompt"`
			Model        *agent.ModelRef `json:"model"`
		}
		if err := c.Bind(&body); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		result, err := provider.Sessions().Run(c.Request().Context(), agent.RunInput{
			Prompt:       body.Prompt,
			WorkingDir:   body.WorkingDir,
			SessionID:    body.SessionID,
			SystemPrompt: body.SystemPrompt,
			Model:        body.Model,
		})
		if err != nil {
			return err
		}
		return httpresponse.Success(c, map[string]any{"result": agent.SerializeRunResult(*result)}, "Run completed successfully")
	})

	api.POST("/:provider/sessions/:id/abort", func(c echo.Context) error {
		provider, err := resolveProvider(c, registry)
		if err != nil {
			return err
		}
		if !provider.Capabilities().SessionsAbort {
			return unsupported(provider, "sessions.abort")
		}
		ok, err := provider.Sessions().Abort(c.Request().Context(), c.Param("id"), "")
		if err != nil {
			return err
		}
		return httpresponse.Success(c, map[string]any{"success": ok}, "Session aborted successfully")
	})
}

func resolveProvider(c echo.Context, registry RegistryProvider) (agent.AgentProvider, error) {
	provider, err := registry.Get(agent.ProviderID(c.Param("provider")))
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusNotFound, err.Error())
	}
	return provider, nil
}

func unsupported(provider agent.AgentProvider, capability string) error {
	return echo.NewHTTPError(http.StatusNotImplemented, agent.NewUnsupportedCapability(provider.ID(), capability).Error())
}

func AsHTTPError(err error) error {
	var unsupported *agent.UnsupportedCapabilityError
	if errors.As(err, &unsupported) {
		return echo.NewHTTPError(http.StatusNotImplemented, err.Error())
	}
	return err
}
