package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"relaid/internal/config"
	"relaid/internal/relay"
	"relaid/internal/secrets"
	"relaid/internal/server"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	Version   = "0.0.4"   // Will be overridden at build time
	GitCommit = "unknown" // Will be overridden at build time
	BuildDate = "unknown" // Will be overridden at build time
)

type App struct {
	ctx      context.Context
	server   *server.Server
	keychain *secrets.Keychain
	handler  *relay.Handler
	client   *relay.Client
	relayURL string
	relayMu  sync.Mutex
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
	a.server = server.New(cfg)

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
		return
	}

	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := a.server.Shutdown(shutdownCtx); err != nil {
		wruntime.LogErrorf(ctx, "embedded server shutdown failed: %v", err)
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

	handler := relay.NewHandler(client, a.server.Registry(), log.Default())
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
