package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"

	"relaid/internal/agent"
	"relaid/internal/config"
	codexprovider "relaid/internal/providers/codex"
	opencodeprovider "relaid/internal/providers/opencode"
	agentsroute "relaid/internal/routes/agents"
	gitroute "relaid/internal/routes/git"
	healthroute "relaid/internal/routes/health"
	projectsroute "relaid/internal/routes/projects"
	custommiddleware "relaid/internal/shared/middleware"
	"relaid/internal/workspace"

	"github.com/labstack/echo/v4"
)

type Server struct {
	cfg        config.Config
	registry   *agent.Registry
	workspaces *workspace.Service
	echo       *echo.Echo
	httpServer *http.Server
	listener   net.Listener
}

func New(cfg config.Config, workspaces *workspace.Service) *Server {
	e := echo.New()
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", c.Request().Header.Get("Origin"))
			c.Response().Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			c.Response().Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
			if c.Request().Method == http.MethodOptions {
				return c.NoContent(http.StatusNoContent)
			}
			return next(c)
		}
	})
	e.HTTPErrorHandler = custommiddleware.ErrorHandler

	s := &Server{
		cfg: cfg,
		registry: agent.NewRegistry(
			opencodeprovider.New(cfg, log.Default()),
			codexprovider.New(cfg, log.Default()),
		),
		workspaces: workspaces,
		echo:       e,
		httpServer: &http.Server{
			Addr:    cfg.ServerAddr,
			Handler: e,
		},
	}

	public := e.Group("/api/public/v1")
	healthroute.Register(public.Group("/health"), s)

	protected := e.Group("/api/v1")
	protected.GET("/status", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"message": "Desktop server running",
		})
	})
	agentsroute.Register(protected.Group("/agents"), s.registry)
	gitroute.Register(protected.Group("/git"), s.registry)
	projectsroute.Register(protected.Group("/projects"), s.registry, s.workspaces)

	return s
}

func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.cfg.ServerAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", s.cfg.ServerAddr, err)
	}

	s.listener = listener
	log.Printf("Embedded server listening on http://%s", listener.Addr().String())

	err = s.httpServer.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	httpErr := s.httpServer.Shutdown(ctx)
	providerErr := s.registry.Shutdown(ctx)
	if httpErr != nil {
		return httpErr
	}
	return providerErr
}

func (s *Server) Healthy() bool {
	return len(s.cfg.MissingConfig) == 0
}

func (s *Server) Issues() []string {
	return s.cfg.MissingConfig
}

func (s *Server) Registry() *agent.Registry {
	return s.registry
}

func (s *Server) Workspaces() *workspace.Service {
	return s.workspaces
}

func (s *Server) Address() string {
	return s.cfg.ServerAddr
}
