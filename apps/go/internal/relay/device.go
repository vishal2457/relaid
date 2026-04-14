package relay

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

type DeviceCredentials struct {
	ServerID     string `json:"serverId"`
	ServerSecret string `json:"serverSecret"`
}

type PairingSessionResponse struct {
	PairingID         string `json:"pairingId"`
	PairingSecret     string `json:"pairingSecret"`
	PairingURL        string `json:"pairingUrl"`
	ExpiresAt         string `json:"expiresAt"`
	PairedDeviceCount int    `json:"pairedDeviceCount"`
	ServerID          string `json:"serverId"`
	ServerName        string `json:"serverName"`
}

type DeviceConfig struct {
	Credentials DeviceCredentials
	RelayURL    string
}

func GetDataDir() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, "maximus-bot-data")
}

func GetDeviceFilePath() string {
	return filepath.Join(GetDataDir(), "relay-device.json")
}

func ensureDataDir() error {
	dir := GetDataDir()
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create data dir: %w", err)
		}
	}
	return nil
}

func GetServerName() string {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}
	if name := os.Getenv("LOCAL_SERVER_NAME"); name != "" {
		return name
	}
	return fmt.Sprintf("%s OpenCode Server", hostname)
}

func LoadOrCreateDeviceCredentials(envServerID, envServerSecret string) (DeviceCredentials, error) {
	if envServerID != "" && envServerSecret != "" {
		return DeviceCredentials{
			ServerID:     envServerID,
			ServerSecret: envServerSecret,
		}, nil
	}

	if err := ensureDataDir(); err != nil {
		return DeviceCredentials{}, err
	}

	devicePath := GetDeviceFilePath()
	if data, err := os.ReadFile(devicePath); err == nil {
		var creds DeviceCredentials
		if json.Unmarshal(data, &creds) == nil && creds.ServerID != "" && creds.ServerSecret != "" {
			return creds, nil
		}
	}

	creds := DeviceCredentials{
		ServerID:     generateUUID(),
		ServerSecret: generateUUID(),
	}

	if data, err := json.Marshal(creds); err == nil {
		os.WriteFile(devicePath, data, 0600)
	}

	return creds, nil
}

func CreatePairingSession(relayURL string, creds DeviceCredentials) (*PairingSessionResponse, error) {
	url, err := buildRelayEndpointURL(relayURL, "/api/pairing/sessions")
	if err != nil {
		return nil, fmt.Errorf("failed to resolve pairing URL: %w", err)
	}

	body, err := json.Marshal(map[string]string{
		"serverName": GetServerName(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to encode request body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-server-id", creds.ServerID)
	req.Header.Set("x-server-secret", creds.ServerSecret)
	req.Header.Set("x-server-name", GetServerName())

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to relay: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("relay returned status %d", resp.StatusCode)
	}

	var result PairingSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

func PingRelayHealth(relayURL string) error {
	url, err := buildRelayEndpointURL(relayURL, "/health")
	if err != nil {
		return fmt.Errorf("failed to resolve health URL: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned %d", resp.StatusCode)
	}
	return nil
}

type MobileClient struct {
	ConnectionID string `json:"connectionId"`
}

type ConnectedClientsResponse struct {
	UserID        string         `json:"userId"`
	MobileClients []MobileClient `json:"mobileClients"`
}

func GetConnectedClients(relayURL string, creds DeviceCredentials) (*ConnectedClientsResponse, error) {
	url, err := buildRelayEndpointURL(relayURL, "/api/debug/connections")
	if err != nil {
		return nil, fmt.Errorf("failed to resolve connections URL: %w", err)
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("x-server-id", creds.ServerID)
	req.Header.Set("x-server-secret", creds.ServerSecret)
	req.Header.Set("x-user-id", creds.ServerID)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to relay: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("relay returned status %d", resp.StatusCode)
	}

	var result ConnectedClientsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

func generateUUID() string {
	return uuid.New().String()
}
