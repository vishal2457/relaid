package services

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"relaid/internal/relay"

	"github.com/inconshreveable/go-update"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type UpdateResponse struct {
	IsUpdateAvailable bool   `json:"isUpdateAvailable"`
	DownloadURL       string `json:"downloadUrl"`
	FileName          string `json:"fileName"`
	CurrentVersion    string `json:"currentVersion"`
	LatestVersion     string `json:"latestVersion"`
	ReleaseTag        string `json:"releaseTag"`
	Target            string `json:"target"`
	Error             string `json:"error,omitempty"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func CheckForUpdates(relayURL string, currentVersion string) (UpdateResponse, error) {
	target, err := CurrentTarget()
	if err != nil {
		return UpdateResponse{}, err
	}

	endpoint, err := relay.BuildRelayEndpointURL(relayURL, "/api/downloads/check")
	if err != nil {
		return UpdateResponse{}, fmt.Errorf("failed to resolve update URL: %w", err)
	}

	parsedURL, err := url.Parse(endpoint)
	if err != nil {
		return UpdateResponse{}, fmt.Errorf("failed to parse update URL: %w", err)
	}

	query := parsedURL.Query()
	query.Set("target", target)
	query.Set("currentVersion", normalizeVersion(currentVersion))
	parsedURL.RawQuery = query.Encode()

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(parsedURL.String())
	if err != nil {
		return UpdateResponse{}, fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var payload errorResponse
		if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil && payload.Error != "" {
			return UpdateResponse{}, errors.New(payload.Error)
		}
		return UpdateResponse{}, fmt.Errorf("update check returned status %d", resp.StatusCode)
	}

	var payload UpdateResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return UpdateResponse{}, fmt.Errorf("failed to decode update response: %w", err)
	}

	if payload.CurrentVersion == "" {
		payload.CurrentVersion = normalizeVersion(currentVersion)
	}

	return payload, nil
}

func CurrentTarget() (string, error) {
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "darwin/arm64":
		return "mac-silicon", nil
	case "darwin/amd64":
		return "mac-intel", nil
	case "linux/amd64":
		return "linux", nil
	case "windows/amd64":
		return "windows", nil
	default:
		return "", fmt.Errorf("updates are not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

func DownloadAndInstallUpdate(ctx context.Context, downloadURL string, fileName string) error {
	wailsRuntime.EventsEmit(ctx, "update_loading_start", nil)
	defer wailsRuntime.EventsEmit(ctx, "update_loading_end", nil)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create update download request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var payload errorResponse
		if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil && payload.Error != "" {
			return errors.New(payload.Error)
		}
		return fmt.Errorf("update download returned status %d", resp.StatusCode)
	}

	binaryData, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read update payload: %w", err)
	}

	resolvedFileName := strings.TrimSpace(fileName)
	if resolvedFileName == "" {
		resolvedFileName = filepath.Base(req.URL.Path)
	}

	return installFromBinaryData(ctx, binaryData, resolvedFileName, false)
}

func InstallFromBinaryData(ctx context.Context, binaryData []byte, fileName string) error {
	return installFromBinaryData(ctx, binaryData, fileName, true)
}

func installFromBinaryData(ctx context.Context, binaryData []byte, fileName string, emitStart bool) error {
	if emitStart {
		wailsRuntime.EventsEmit(ctx, "update_loading_start", nil)
		defer wailsRuntime.EventsEmit(ctx, "update_loading_end", nil)
	}

	// Check for reasonable file size (limit to 500MB)
	const maxFileSize = 500 * 1024 * 1024 // 500MB
	if len(binaryData) > maxFileSize {
		err := fmt.Errorf("binary data too large: %d bytes (max: %d bytes)", len(binaryData), maxFileSize)
		return err
	}

	// Check if this is a macOS zip file
	if runtime.GOOS == "darwin" {

		// Debug: Check first few bytes to verify data integrity
		if len(binaryData) >= 4 {
			log.Printf("First 4 bytes: %x", binaryData[:4])
			// ZIP files should start with PK (0x504B)
			if len(binaryData) >= 2 && binaryData[0] == 0x50 && binaryData[1] == 0x4B {
				log.Println("Data appears to be a valid ZIP file (starts with PK signature)")
			} else {
				log.Printf("Data does not appear to be a ZIP file. First 2 bytes: %x", binaryData[:2])
			}
		}

		err := handleMacOSZipUpdate(ctx, binaryData)
		if err != nil {
			return err
		}
		return nil
	}

	// For non-macOS or non-zip files, apply directly
	err := update.Apply(bytes.NewReader(binaryData), update.Options{})
	if err != nil {
		log.Printf("Failed to apply update: %v", err)
		return err
	}

	// Restart application
	return restartApplication(ctx)
}

func handleMacOSZipUpdate(ctx context.Context, zipData []byte) error {
	if len(zipData) == 0 {
		return fmt.Errorf("zip data is empty")
	}

	// Create a zip reader from the data
	zipReader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		log.Printf("Failed to create zip reader: %v", err)
		return fmt.Errorf("failed to read zip file: %w", err)
	}

	// Find the app bundle and extract the binary
	var binaryData []byte

	for _, file := range zipReader.File {

		// Look for the binary inside the .app bundle
		// Pattern: *.app/Contents/MacOS/*
		if strings.Contains(file.Name, ".app/Contents/MacOS/") && !strings.HasSuffix(file.Name, "/") {

			// Open the file
			rc, err := file.Open()
			if err != nil {
				log.Printf("Failed to open file %s: %v", file.Name, err)
				continue
			}

			// Read the binary data
			binaryData, err = io.ReadAll(rc)
			rc.Close()

			if err != nil {
				log.Printf("Failed to read file %s: %v", file.Name, err)
				continue
			}

			log.Printf("Successfully read binary data: %d bytes", len(binaryData))

			// Found the binary, break out of loop
			break
		}
	}

	if binaryData == nil {
		return fmt.Errorf("no binary found in macOS app bundle")
	}

	log.Printf("Binary data found, size: %d bytes", len(binaryData))

	// Apply the update with the extracted binary
	err = update.Apply(bytes.NewReader(binaryData), update.Options{})
	if err != nil {
		log.Printf("Failed to apply update: %v", err)
		return err
	}

	// Restart application
	log.Println("Restarting application...")
	return restartApplication(ctx)
}

// restartApplication starts a new instance of the application and then quits the current one
func restartApplication(ctx context.Context) error {
	executablePath, err := os.Executable()
	if err != nil {
		log.Printf("Failed to get executable path: %v", err)
		// Fallback to just quitting
		wailsRuntime.Quit(ctx)
		return err
	}

	// Handle macOS app bundle case
	if runtime.GOOS == "darwin" {
		// If we're inside a .app bundle, we need to launch the .app bundle, not the binary directly
		if strings.Contains(executablePath, ".app/Contents/MacOS/") {
			// Extract the .app path from the executable path
			// e.g., /Applications/MyApp.app/Contents/MacOS/myapp -> /Applications/MyApp.app
			appPath := executablePath
			for strings.Contains(appPath, ".app/") && !strings.HasSuffix(appPath, ".app") {
				appPath = filepath.Dir(appPath)
			}

			if strings.HasSuffix(appPath, ".app") {
				// Use 'open' command to launch the .app bundle
				cmd := exec.Command("open", appPath)
				err := cmd.Start()
				if err != nil {
					log.Printf("Failed to restart application using 'open': %v", err)
				} else {
					log.Println("Successfully started new app instance via 'open'")
					// Give the new instance time to start before quitting
					time.Sleep(1 * time.Second)
					wailsRuntime.Quit(ctx)
					return nil
				}
			}
		}
	}

	// For non-macOS or direct binary execution
	cmd := exec.Command(executablePath)
	cmd.Env = os.Environ()

	// Start the new instance
	err = cmd.Start()
	if err != nil {
		log.Printf("Failed to restart application: %v", err)
		// Fallback to just quitting
		wailsRuntime.Quit(ctx)
		return err
	}

	log.Println("Successfully started new app instance")
	// Give the new instance time to start before quitting
	time.Sleep(1 * time.Second)
	wailsRuntime.Quit(ctx)
	return nil
}

func normalizeVersion(value string) string {
	return strings.TrimPrefix(strings.TrimSpace(value), "v")
}
