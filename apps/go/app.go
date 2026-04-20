package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"relaid/internal/agent"
	"relaid/internal/config"
	"relaid/internal/db"
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

	go func() {
		log.Println("Starting embedded server")
		if err := a.server.Start(); err != nil {
			log.Printf("embedded server stopped: %v", err)
			wruntime.LogErrorf(ctx, "embedded server stopped: %v", err)
		}
	}()

	a.startRelayClient()
}

func (a *App) startRelayClient() {
	relayURL, err := a.keychain.Get(RELAY_URL_KEY)
	if err != nil || relayURL == "" {
		log.Println("relay: URL not configured, skipping relay connection")
		return
	}

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

func (a *App) GetStoredRelayURL() (string, error) {
	url, err := a.keychain.Get(RELAY_URL_KEY)
	if err != nil {
		return "", nil
	}
	return url, nil
}

func (a *App) StoreRelayURL(url string) error {
	normalizedURL := relay.NormalizeRelayURL(url)
	if err := relay.PingRelayHealth(normalizedURL); err != nil {
		return fmt.Errorf("relay server is not reachable: %w", err)
	}
	if err := a.keychain.Set(RELAY_URL_KEY, normalizedURL); err != nil {
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
	url, err := a.keychain.Get(RELAY_URL_KEY)
	if err != nil || url == "" {
		return nil, fmt.Errorf("relay URL not configured")
	}

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
	url, err := a.keychain.Get(RELAY_URL_KEY)
	if err != nil || url == "" {
		return false, nil
	}

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
	url, err := a.keychain.Get(RELAY_URL_KEY)
	if err != nil || url == "" {
		return nil, fmt.Errorf("relay URL not configured")
	}

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

	bridge := relay.NewRelayPermissionBridge(handler)
	if p, err := a.server.Registry().Get(agent.ProviderOpencode); err == nil {
		if op, ok := p.(*opencodeprovider.Provider); ok {
			op.SetInteractionHandler(bridge)
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
