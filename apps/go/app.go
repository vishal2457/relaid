package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/config"
	"relaid/internal/db"
	codexprovider "relaid/internal/providers/codex"
	opencodeprovider "relaid/internal/providers/opencode"
	"relaid/internal/relay"
	"relaid/internal/secrets"
	"relaid/internal/server"
	"relaid/internal/workspace"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	Version   = "0.0.4"   // Will be overridden at build time
	GitCommit = "unknown" // Will be overridden at build time
	BuildDate = "unknown" // Will be overridden at build time
)

type App struct {
	ctx        context.Context
	server     *server.Server
	db         *db.Database
	workspaces *workspace.Service
	keychain   *secrets.Keychain
	handler    *relay.Handler
	client     *relay.Client
	relayURL   string
	relayMu    sync.Mutex
}

type DesktopStatusPayload struct {
	Server   DesktopServerStatus   `json:"server"`
	Opencode DesktopOpencodeStatus `json:"opencode"`
	Codex    DesktopCodexStatus    `json:"codex"`
}

type DesktopServerStatus struct {
	BaseURL string `json:"baseUrl"`
	Healthy bool   `json:"healthy"`
}

type DesktopOpencodeStatus struct {
	Available      bool              `json:"available"`
	Connected      bool              `json:"connected"`
	StatusMessage  string            `json:"statusMessage,omitempty"`
	Providers      []DesktopProvider `json:"providers"`
	Agents         []DesktopAgent    `json:"agents"`
	AvailableTools []string          `json:"availableTools"`
	Errors         []string          `json:"errors,omitempty"`
}

type DesktopCodexStatus struct {
	Available      bool              `json:"available"`
	Connected      bool              `json:"connected"`
	StatusMessage  string            `json:"statusMessage,omitempty"`
	Providers      []DesktopProvider `json:"providers"`
	Agents         []DesktopAgent    `json:"agents"`
	AvailableTools []string          `json:"availableTools"`
	Errors         []string          `json:"errors,omitempty"`
}

type DesktopProvider struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ModelCount int      `json:"modelCount"`
	Models     []string `json:"models"`
}

type DesktopAgent struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Mode        string   `json:"mode,omitempty"`
	Hidden      bool     `json:"hidden"`
	Tools       []string `json:"tools"`
}

func NewApp() *App {
	return &App{
		keychain: secrets.New(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	log.Println("Starting desktop")

	cfg := config.Load()
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	if err := database.Migrate(ctx); err != nil {
		log.Fatalf("database migration failed: %v", err)
	}
	a.db = database
	a.workspaces = workspace.NewService(database.Queries())
	a.server = server.New(cfg, a.workspaces)

	if provider, err := a.server.Registry().Get(agent.ProviderOpencode); err == nil {
		if err := a.workspaces.SyncOpencodeProjects(ctx, provider); err != nil {
			log.Printf("workspace sync via provider failed: %v", err)
			if dbErr := a.workspaces.SyncOpencodeDatabase(ctx, cfg.OpencodeDBPath); dbErr != nil {
				log.Printf("workspace sync via local opencode db failed: %v", dbErr)
			}
		}
	} else {
		if err := a.workspaces.SyncOpencodeDatabase(ctx, cfg.OpencodeDBPath); err != nil {
			log.Printf("workspace sync via local opencode db failed: %v", err)
		}
	}

	log.Println("Starting embedded server")
	if err := a.server.Start(); err != nil {
		log.Printf("embedded server stopped: %v", err)
		wruntime.LogErrorf(ctx, "embedded server stopped: %v", err)
	}

	a.startRelayClient()
}

func (a *App) startRelayClient() {
	relayURL := a.getEffectiveRelayURL()

	creds, err := relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
	if err != nil {
		log.Printf("relay: failed to load device credentials: %v", err)
		return
	}

	if err := relay.PingRelayHealth(relayURL); err != nil {
		log.Printf("relay: relay server not reachable: %v", err)
		return
	}

	if err := a.configureRelayClient(relayURL, creds); err != nil {
		log.Printf("relay: failed to start relay client: %v", err)
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.relayMu.Lock()
	client := a.client
	a.client = nil
	a.handler = nil
	a.relayURL = ""
	a.relayMu.Unlock()

	if client != nil {
		client.Close()
	}

	if a.server == nil {
	} else {
		shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			wruntime.LogErrorf(ctx, "embedded server shutdown failed: %v", err)
		}
	}

	if a.db != nil {
		if err := a.db.Close(); err != nil {
			wruntime.LogErrorf(ctx, "database shutdown failed: %v", err)
		}
	}
}

const RELAY_URL_KEY = "relay_server_url"

func (a *App) getEffectiveRelayURL() string {
	url, err := a.keychain.Get(RELAY_URL_KEY)
	if err == nil {
		normalizedURL := relay.NormalizeRelayURL(url)
		if normalizedURL != "" {
			return normalizedURL
		}
	}

	return relay.NormalizeRelayURL(relay.DefaultRelayURL)
}

func (a *App) GetStoredRelayURL() (string, error) {
	return a.getEffectiveRelayURL(), nil
}

func (a *App) StoreRelayURL(url string) error {
	normalizedURL := relay.NormalizeRelayURL(url)
	if normalizedURL == "" {
		if err := a.keychain.Delete(RELAY_URL_KEY); err != nil {
			log.Printf("relay: failed to clear stored relay URL: %v", err)
		}
		a.disconnectRelayClient()
		normalizedURL = relay.NormalizeRelayURL(relay.DefaultRelayURL)
	}

	if normalizedURL == "" {
		return fmt.Errorf("relay URL not configured")
	}

	if err := relay.PingRelayHealth(normalizedURL); err != nil {
		return fmt.Errorf("relay server is not reachable: %w", err)
	}

	if normalizedURL == relay.NormalizeRelayURL(relay.DefaultRelayURL) {
		if err := a.keychain.Delete(RELAY_URL_KEY); err != nil {
			log.Printf("relay: failed to clear stored relay URL: %v", err)
		}
	} else if err := a.keychain.Set(RELAY_URL_KEY, normalizedURL); err != nil {
		return fmt.Errorf("failed to store URL: %w", err)
	}

	creds, err := relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
	if err != nil {
		return fmt.Errorf("failed to load relay credentials: %w", err)
	}

	if err := a.configureRelayClient(normalizedURL, creds); err != nil {
		return fmt.Errorf("failed to configure relay client: %w", err)
	}

	return nil
}

func (a *App) GetDeviceCredentials() (relay.DeviceCredentials, error) {
	return relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
}

func (a *App) CreatePairingSession() (*relay.PairingSessionResponse, error) {
	url := a.getEffectiveRelayURL()

	creds, err := relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
	if err != nil {
		return nil, err
	}

	if err := a.configureRelayClient(url, creds); err != nil {
		return nil, err
	}

	return relay.CreatePairingSession(url, creds)
}

func (a *App) PingRelay() (bool, error) {
	url := a.getEffectiveRelayURL()

	if err := relay.PingRelayHealth(url); err != nil {
		return false, nil
	}

	creds, err := relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
	if err != nil {
		return false, err
	}

	if err := a.configureRelayClient(url, creds); err != nil {
		return false, err
	}

	a.relayMu.Lock()
	client := a.client
	a.relayMu.Unlock()

	if client == nil {
		return false, nil
	}

	return client.WaitUntilConnected(2 * time.Second), nil
}

func (a *App) GetConnectedClients() ([]relay.MobileClient, error) {
	url := a.getEffectiveRelayURL()

	creds, err := relay.LoadOrCreateDeviceCredentials(
		os.Getenv("LOCAL_SERVER_ID"),
		os.Getenv("LOCAL_SERVER_SECRET"),
	)
	if err != nil {
		return nil, err
	}

	response, err := relay.GetConnectedClients(url, creds)
	if err != nil {
		return nil, err
	}

	return response.MobileClients, nil
}

func (a *App) GetServerBaseURL() string {
	if a.server == nil {
		return ""
	}

	addr := a.server.Address()
	if addr == "" {
		return ""
	}

	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "http://" + addr
	}
	if host == "" || host == "::" {
		host = "127.0.0.1"
	}

	return fmt.Sprintf("http://%s:%s", host, port)
}

func (a *App) GetDesktopStatus() DesktopStatusPayload {
	payload := DesktopStatusPayload{
		Server: DesktopServerStatus{
			BaseURL: a.GetServerBaseURL(),
			Healthy: a.server != nil,
		},
		Opencode: DesktopOpencodeStatus{
			Providers:      []DesktopProvider{},
			Agents:         []DesktopAgent{},
			AvailableTools: []string{},
		},
		Codex: DesktopCodexStatus{
			Providers:      []DesktopProvider{},
			Agents:         []DesktopAgent{},
			AvailableTools: []string{},
		},
	}

	if a.server == nil {
		payload.Opencode.StatusMessage = "Desktop server is unavailable"
		payload.Opencode.Errors = []string{"desktop server is unavailable"}
		payload.Codex.StatusMessage = "Desktop server is unavailable"
		payload.Codex.Errors = []string{"desktop server is unavailable"}
		return payload
	}

	provider, err := a.server.Registry().Get(agent.ProviderOpencode)
	if err != nil {
		payload.Opencode.StatusMessage = "OpenCode provider is not registered"
		payload.Opencode.Errors = []string{err.Error()}
	} else {
		if a.server.Healthy() {
			payload.Server.Healthy = true
		}

		payload.Opencode.Available = isOpencodeAvailable(a.server)

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		agents, agentErr := provider.Agents().List(ctx, "")
		if agentErr != nil {
			payload.Opencode.StatusMessage = "OpenCode is unavailable"
			payload.Opencode.Errors = []string{agentErr.Error()}
		} else {
			payload.Opencode.Connected = true
			payload.Opencode.StatusMessage = "OpenCode connected"

			providers, providerErr := provider.Providers().List(ctx)
			if providerErr != nil {
				payload.Opencode.Errors = []string{providerErr.Error()}
			} else {
				payload.Opencode.Providers = serializeDesktopProviders(providers)
			}

			payload.Opencode.Agents, payload.Opencode.AvailableTools = serializeDesktopAgents(agents)
			if !payload.Opencode.Available {
				payload.Opencode.Available = true
			}
		}
	}

	codexProvider, err := a.server.Registry().Get(agent.ProviderCodex)
	if err != nil {
		payload.Codex.StatusMessage = "Codex provider is not registered"
		payload.Codex.Errors = []string{err.Error()}
		return payload
	}

	payload.Codex.Available = isCodexAvailable(a.server)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	providers, providerErr := codexProvider.Providers().List(ctx)
	if providerErr != nil {
		payload.Codex.StatusMessage = "Codex is unavailable"
		payload.Codex.Errors = []string{providerErr.Error()}
		return payload
	}

	payload.Codex.Connected = true
	payload.Codex.StatusMessage = "Codex connected"
	payload.Codex.Providers = serializeDesktopProviders(providers)
	if !payload.Codex.Available {
		payload.Codex.Available = true
	}

	return payload
}

func (a *App) disconnectRelayClient() {
	a.relayMu.Lock()
	client := a.client
	a.client = nil
	a.handler = nil
	a.relayURL = ""
	a.relayMu.Unlock()

	if client != nil {
		client.Close()
	}
}

func isOpencodeAvailable(s *server.Server) bool {
	if s == nil {
		return false
	}

	cfg := config.Load()
	if cfg.OpencodeBaseURL != "" {
		return true
	}

	_, err := exec.LookPath(cfg.OpencodeBin)
	return err == nil
}

func isCodexAvailable(s *server.Server) bool {
	if s == nil {
		return false
	}

	cfg := config.Load()
	_, err := exec.LookPath(cfg.CodexBin)
	return err == nil
}

func serializeDesktopProviders(providers []agent.Provider) []DesktopProvider {
	result := make([]DesktopProvider, 0, len(providers))
	for _, provider := range providers {
		models := make([]string, 0, len(provider.Models))
		for _, model := range provider.Models {
			name := model.Name
			if name == "" {
				name = model.ID
			}
			models = append(models, name)
		}
		sort.Strings(models)

		result = append(result, DesktopProvider{
			ID:         provider.ID,
			Name:       provider.Name,
			ModelCount: len(provider.Models),
			Models:     models,
		})
	}
	return result
}

func serializeDesktopAgents(agents []agent.AgentConfig) ([]DesktopAgent, []string) {
	result := make([]DesktopAgent, 0, len(agents))
	toolSet := map[string]struct{}{}

	for _, item := range agents {
		if item.Hidden {
			continue
		}

		tools := append([]string(nil), item.Tools...)
		sort.Strings(tools)
		for _, tool := range tools {
			toolSet[tool] = struct{}{}
		}

		result = append(result, DesktopAgent{
			Name:        item.Name,
			Description: item.Description,
			Mode:        item.Mode,
			Hidden:      item.Hidden,
			Tools:       tools,
		})
	}

	availableTools := make([]string, 0, len(toolSet))
	for tool := range toolSet {
		availableTools = append(availableTools, tool)
	}
	sort.Strings(availableTools)

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result, availableTools
}

func (a *App) configureRelayClient(relayURL string, creds relay.DeviceCredentials) error {
	normalizedURL := relay.NormalizeRelayURL(relayURL)
	if normalizedURL == "" {
		return fmt.Errorf("relay URL not configured")
	}

	a.relayMu.Lock()
	if a.client != nil && a.relayURL == normalizedURL {
		client := a.client
		a.relayMu.Unlock()
		return client.Connect()
	}

	oldClient := a.client
	a.client = nil
	a.handler = nil
	a.relayURL = ""
	a.relayMu.Unlock()

	if oldClient != nil {
		oldClient.Close()
	}

	client := relay.NewClient(relay.ClientOptions{
		RelayURL:          normalizedURL,
		ServerID:          creds.ServerID,
		ServerSecret:      creds.ServerSecret,
		ServerName:        relay.GetServerName(),
		ReconnectInterval: 5 * time.Second,
		MaxReconnectDelay: 30 * time.Second,
		Logger:            log.Default(),
		OnConnect: func() {
			log.Println("relay: connected to relay server")
		},
		OnDisconnect: func(reason string) {
			log.Printf("relay: disconnected from relay server: %s", reason)
		},
	})

	handler := relay.NewHandler(client, a.server.Registry(), a.workspaces, log.Default())

	if p, err := a.server.Registry().Get(agent.ProviderOpencode); err == nil {
		if op, ok := p.(*opencodeprovider.Provider); ok {
			op.SetInteractionHandler(relay.NewRelayPermissionBridge(handler, string(agent.ProviderOpencode)))
		}
	}
	if p, err := a.server.Registry().Get(agent.ProviderCodex); err == nil {
		if codex, ok := p.(*codexprovider.Provider); ok {
			codex.SetInteractionHandler(relay.NewRelayPermissionBridge(handler, string(agent.ProviderCodex)))
		}
	}

	client.SetEventHandler(handler.OnEvent)

	if err := client.Connect(); err != nil {
		return err
	}

	a.relayMu.Lock()
	a.client = client
	a.handler = handler
	a.relayURL = normalizedURL
	a.relayMu.Unlock()

	return nil
}

type WorkspacePayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Directory   string `json:"directory"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

func (a *App) ListWorkspaces() ([]WorkspacePayload, error) {
	if a.workspaces == nil {
		return nil, fmt.Errorf("workspace service unavailable")
	}
	items, err := a.workspaces.List(context.Background())
	if err != nil {
		return nil, err
	}
	result := make([]WorkspacePayload, 0, len(items))
	for _, item := range items {
		result = append(result, serializeWorkspace(item))
	}
	return result, nil
}

func (a *App) SelectWorkspaceDirectory() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application context is unavailable")
	}
	selected, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "Select workspace directory",
	})
	if err != nil {
		return "", err
	}
	return selected, nil
}

func (a *App) CreateWorkspace(directory string) (*WorkspacePayload, error) {
	if a.workspaces == nil {
		return nil, fmt.Errorf("workspace service unavailable")
	}

	item, err := a.workspaces.Create(context.Background(), workspace.CreateInput{
		Name:      filepath.Base(directory),
		Directory: directory,
	})
	if err != nil {
		return nil, err
	}

	if a.server != nil {
		if provider, err := a.server.Registry().Get(agent.ProviderOpencode); err == nil {
			_, _ = a.workspaces.EnsureOpencodeProjectID(context.Background(), provider, item)
		}
	}

	payload := serializeWorkspace(*item)
	return &payload, nil
}

func serializeWorkspace(item workspace.Workspace) WorkspacePayload {
	return WorkspacePayload{
		ID:          item.Key,
		Name:        item.Name,
		Description: item.Description,
		Directory:   item.Directory,
		CreatedAt:   item.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   item.UpdatedAt.Format(time.RFC3339),
	}
}
