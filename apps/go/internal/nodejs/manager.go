package nodejs

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	DefaultVersion    = "22.22.2"
	MinimumMajor      = 20
	eventStatusName   = "node_runtime_status"
	eventProgressName = "node_runtime_progress"
)

type Source string

const (
	SourceNone    Source = "none"
	SourceSystem  Source = "system"
	SourceManaged Source = "managed"
)

type State string

const (
	StateNotFound     State = "not_found"
	StateIncompatible State = "incompatible"
	StateReady        State = "ready"
	StateDownloading  State = "downloading"
	StateInstalling   State = "installing"
	StateFailed       State = "failed"
)

type Status struct {
	Found       bool   `json:"found"`
	Compatible  bool   `json:"compatible"`
	Source      Source `json:"source"`
	Version     string `json:"version"`
	BinaryPath  string `json:"binaryPath"`
	InstallPath string `json:"installPath"`
	State       State  `json:"state"`
	Error       string `json:"error,omitempty"`
}

type progressPayload struct {
	Stage   string `json:"stage"`
	Message string `json:"message"`
}

type probe struct {
	path       string
	version    string
	major      int
	compatible bool
	source     Source
	installDir string
}

type Manager struct {
	logger        *log.Logger
	httpClient    *http.Client
	lookPath      func(string) (string, error)
	commandRunner func(context.Context, string, ...string) *exec.Cmd

	mu          sync.Mutex
	ctx         context.Context
	overrideDir string
	lastStatus  Status
}

func NewManager(logger *log.Logger) *Manager {
	if logger == nil {
		logger = log.Default()
	}
	return &Manager{
		logger:     logger,
		httpClient: &http.Client{Timeout: 15 * time.Minute},
		lookPath:   exec.LookPath,
		commandRunner: func(ctx context.Context, name string, args ...string) *exec.Cmd {
			return exec.CommandContext(ctx, name, args...)
		},
		lastStatus: Status{Source: SourceNone, State: StateNotFound},
	}
}

func (m *Manager) SetAppContext(ctx context.Context) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ctx = ctx
}

func (m *Manager) Status(ctx context.Context) Status {
	m.mu.Lock()
	cached := m.lastStatus
	overrideDir := m.overrideDir
	m.mu.Unlock()

	if cached.State == StateDownloading || cached.State == StateInstalling {
		return cached
	}

	status := m.resolve(ctx, overrideDir)
	m.setLastStatus(status)
	return status
}

func (m *Manager) ResolveBinary(ctx context.Context) (Status, error) {
	status := m.Status(ctx)
	if !status.Compatible || status.BinaryPath == "" {
		if status.Error != "" {
			return status, errors.New(status.Error)
		}
		return status, fmt.Errorf("no compatible node runtime found")
	}
	return status, nil
}

func (m *Manager) DownloadAndInstall(ctx context.Context, version string) (Status, error) {
	version = normalizeVersion(version)
	if version == "" {
		version = DefaultVersion
	}

	m.updateStatus(Status{
		Found:      false,
		Compatible: false,
		Source:     SourceNone,
		State:      StateDownloading,
		Version:    version,
	})
	m.emitProgress("download", fmt.Sprintf("Downloading Node.js %s", version))

	rootDir, err := m.runtimeRoot()
	if err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	artifact, err := artifactFor(version)
	if err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	tmpDir, err := os.MkdirTemp("", "relaid-node-download-*")
	if err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}
	defer os.RemoveAll(tmpDir)

	archivePath := filepath.Join(tmpDir, artifact.fileName)
	if err := m.downloadFile(ctx, artifact.url, archivePath); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	m.updateStatus(Status{
		Found:      false,
		Compatible: false,
		Source:     SourceNone,
		State:      StateInstalling,
		Version:    version,
	})
	m.emitProgress("install", fmt.Sprintf("Installing Node.js %s", version))

	extractedDir := filepath.Join(tmpDir, "extracted")
	if err := os.MkdirAll(extractedDir, 0o755); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	if err := extractArchive(archivePath, extractedDir); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	payloadRoot, err := locateSinglePayloadRoot(extractedDir)
	if err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	targetDir := filepath.Join(rootDir, "managed", version)
	if err := os.RemoveAll(targetDir); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}
	if err := os.MkdirAll(filepath.Dir(targetDir), 0o755); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}
	if err := moveDirContents(payloadRoot, targetDir); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	binaryPath := managedBinaryPath(targetDir)
	if err := writeMetadata(targetDir, managedMetadata{
		Version:     version,
		BinaryPath:  binaryPath,
		InstalledAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		status := Status{Source: SourceNone, State: StateFailed, Version: version, Error: err.Error()}
		m.updateStatus(status)
		return status, err
	}

	status := m.resolve(ctx, rootDir)
	if !status.Compatible || status.Source != SourceManaged {
		err := fmt.Errorf("managed Node install completed but runtime is still unavailable")
		status.State = StateFailed
		status.Error = err.Error()
		m.updateStatus(status)
		return status, err
	}

	m.emitProgress("complete", fmt.Sprintf("Node.js %s is ready", status.Version))
	m.updateStatus(status)
	return status, nil
}

func (m *Manager) resolve(ctx context.Context, overrideDir string) Status {
	systemCandidates := m.systemCandidates()
	systemProbe, systemErr := m.firstProbe(ctx, systemCandidates, SourceSystem)
	if systemProbe != nil && systemProbe.compatible {
		return Status{
			Found:       true,
			Compatible:  true,
			Source:      SourceSystem,
			Version:     systemProbe.version,
			BinaryPath:  systemProbe.path,
			State:       StateReady,
			InstallPath: filepath.Dir(systemProbe.path),
		}
	}

	rootDir := overrideDir
	if rootDir == "" {
		var err error
		rootDir, err = m.runtimeRoot()
		if err != nil {
			if systemProbe != nil {
				return incompatibleStatus(systemProbe, systemErr)
			}
			return Status{
				Source: SourceNone,
				State:  StateFailed,
				Error:  err.Error(),
			}
		}
	}

	managedCandidates := m.managedCandidates(rootDir)
	managedProbe, managedErr := m.firstProbe(ctx, managedCandidates, SourceManaged)
	if managedProbe != nil && managedProbe.compatible {
		status := Status{
			Found:       true,
			Compatible:  true,
			Source:      SourceManaged,
			Version:     managedProbe.version,
			BinaryPath:  managedProbe.path,
			InstallPath: managedProbe.installDir,
			State:       StateReady,
		}
		if systemProbe != nil && !systemProbe.compatible {
			status.Error = fmt.Sprintf(
				"System Node.js %s is below the required major version %d, using managed Node.js %s instead.",
				systemProbe.version,
				MinimumMajor,
				managedProbe.version,
			)
		}
		return status
	}

	if systemProbe != nil {
		return incompatibleStatus(systemProbe, systemErr)
	}
	if managedProbe != nil {
		return incompatibleStatus(managedProbe, managedErr)
	}
	return Status{
		Source:     SourceNone,
		State:      StateNotFound,
		Compatible: false,
		Found:      false,
		Error:      fmt.Sprintf("Node.js %d+ was not found on this machine", MinimumMajor),
	}
}

func incompatibleStatus(p *probe, fallbackErr error) Status {
	status := Status{
		Found:       true,
		Compatible:  false,
		Source:      p.source,
		Version:     p.version,
		BinaryPath:  p.path,
		InstallPath: p.installDir,
		State:       StateIncompatible,
		Error: fmt.Sprintf(
			"Node.js %s is below the required major version %d.",
			p.version,
			MinimumMajor,
		),
	}
	if fallbackErr != nil && status.Error == "" {
		status.Error = fallbackErr.Error()
	}
	return status
}

func (m *Manager) systemCandidates() []string {
	seen := map[string]struct{}{}
	add := func(values ...string) []string {
		result := []string{}
		for _, value := range values {
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			if _, ok := seen[value]; ok {
				continue
			}
			seen[value] = struct{}{}
			result = append(result, value)
		}
		return result
	}

	candidates := []string{}
	candidates = append(candidates, add(os.Getenv("NODE_BIN"))...)
	if path, err := m.lookPath("node"); err == nil {
		candidates = append(candidates, add(path)...)
	}

	home, _ := os.UserHomeDir()
	if home != "" {
		candidates = append(candidates, add(
			filepath.Join(home, ".local", "bin", executableName("node")),
			filepath.Join(home, ".volta", "bin", executableName("node")),
		)...)
		candidates = append(candidates, add(nvmExecutablePaths(home, executableName("node"))...)...)
	}

	candidates = append(candidates, add(
		filepath.Join("/opt/homebrew/bin", executableName("node")),
		filepath.Join("/usr/local/bin", executableName("node")),
	)...)

	return candidates
}

func (m *Manager) managedCandidates(rootDir string) []string {
	managedRoot := filepath.Join(rootDir, "managed")
	entries, err := os.ReadDir(managedRoot)
	if err != nil {
		return nil
	}

	type versionDir struct {
		version string
		path    string
	}
	versions := make([]versionDir, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		version := normalizeVersion(entry.Name())
		if version == "" {
			continue
		}
		versions = append(versions, versionDir{
			version: version,
			path:    filepath.Join(managedRoot, entry.Name()),
		})
	}
	sort.Slice(versions, func(i, j int) bool {
		return compareSemver(versions[i].version, versions[j].version) > 0
	})

	candidates := make([]string, 0, len(versions))
	for _, version := range versions {
		candidates = append(candidates, managedBinaryPath(version.path))
	}
	return candidates
}

func (m *Manager) firstProbe(ctx context.Context, candidates []string, source Source) (*probe, error) {
	var lastErr error
	for _, candidate := range candidates {
		p, err := m.probeBinary(ctx, candidate, source)
		if err != nil {
			lastErr = err
			continue
		}
		if source == SourceManaged {
			p.installDir = filepath.Dir(filepath.Dir(candidate))
			if runtime.GOOS == "windows" {
				p.installDir = filepath.Dir(candidate)
			}
		} else {
			p.installDir = filepath.Dir(candidate)
		}
		return p, nil
	}
	return nil, lastErr
}

func (m *Manager) probeBinary(ctx context.Context, binaryPath string, source Source) (*probe, error) {
	if strings.TrimSpace(binaryPath) == "" {
		return nil, errors.New("binary path is empty")
	}
	info, err := os.Stat(binaryPath)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%s is a directory", binaryPath)
	}

	cmd := m.commandRunner(ctx, binaryPath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	version, major, err := parseNodeVersion(string(output))
	if err != nil {
		return nil, err
	}
	return &probe{
		path:       binaryPath,
		version:    version,
		major:      major,
		compatible: major >= MinimumMajor,
		source:     source,
	}, nil
}

func parseNodeVersion(raw string) (string, int, error) {
	value := normalizeVersion(strings.TrimSpace(raw))
	if value == "" {
		return "", 0, fmt.Errorf("failed to parse node version from %q", raw)
	}
	parts := strings.Split(strings.TrimPrefix(value, "v"), ".")
	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return "", 0, fmt.Errorf("failed to parse node major version from %q", raw)
	}
	return value, major, nil
}

func (m *Manager) runtimeRoot() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}
	root := filepath.Join(configDir, "relaid", "runtime", "node")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	return root, nil
}

func (m *Manager) downloadFile(ctx context.Context, rawURL, destPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("node download failed with status %d", resp.StatusCode)
	}

	file, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer file.Close()

	if _, err := io.Copy(file, resp.Body); err != nil {
		return err
	}
	return nil
}

func (m *Manager) emitProgress(stage, message string) {
	m.mu.Lock()
	ctx := m.ctx
	m.mu.Unlock()
	if ctx == nil {
		return
	}
	wruntime.EventsEmit(ctx, eventProgressName, progressPayload{
		Stage:   stage,
		Message: message,
	})
}

func (m *Manager) updateStatus(status Status) {
	m.setLastStatus(status)
	m.mu.Lock()
	ctx := m.ctx
	m.mu.Unlock()
	if ctx != nil {
		wruntime.EventsEmit(ctx, eventStatusName, status)
	}
}

func (m *Manager) setLastStatus(status Status) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastStatus = status
}

type managedMetadata struct {
	Version     string `json:"version"`
	BinaryPath  string `json:"binaryPath"`
	InstalledAt string `json:"installedAt"`
}

func writeMetadata(targetDir string, metadata managedMetadata) error {
	payload, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(targetDir, "metadata.json"), payload, 0o644)
}

type artifact struct {
	url      string
	fileName string
}

func artifactFor(version string) (artifact, error) {
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "darwin/arm64":
		fileName := fmt.Sprintf("node-%s-darwin-arm64.tar.gz", version)
		return artifact{url: "https://nodejs.org/dist/" + version + "/" + fileName, fileName: fileName}, nil
	case "darwin/amd64":
		fileName := fmt.Sprintf("node-%s-darwin-x64.tar.gz", version)
		return artifact{url: "https://nodejs.org/dist/" + version + "/" + fileName, fileName: fileName}, nil
	case "linux/amd64":
		fileName := fmt.Sprintf("node-%s-linux-x64.tar.gz", version)
		return artifact{url: "https://nodejs.org/dist/" + version + "/" + fileName, fileName: fileName}, nil
	case "windows/amd64":
		fileName := fmt.Sprintf("node-%s-win-x64.zip", version)
		return artifact{url: "https://nodejs.org/dist/" + version + "/" + fileName, fileName: fileName}, nil
	default:
		return artifact{}, fmt.Errorf("node download is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

func extractArchive(archivePath, destDir string) error {
	switch {
	case strings.HasSuffix(archivePath, ".zip"):
		return extractZip(archivePath, destDir)
	case strings.HasSuffix(archivePath, ".tar.gz"):
		return extractTarGz(archivePath, destDir)
	default:
		return fmt.Errorf("unsupported archive type for %s", archivePath)
	}
}

func extractZip(archivePath, destDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath := filepath.Join(destDir, file.Name)
		if !strings.HasPrefix(targetPath, filepath.Clean(destDir)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destDir) {
			return fmt.Errorf("invalid zip entry path %q", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}
		src, err := file.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return err
		}
		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			src.Close()
			return err
		}
		dst.Close()
		src.Close()
	}
	return nil
}

func extractTarGz(archivePath, destDir string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}

		targetPath := filepath.Join(destDir, header.Name)
		if !strings.HasPrefix(targetPath, filepath.Clean(destDir)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destDir) {
			return fmt.Errorf("invalid tar entry path %q", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return err
			}
			dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(dst, tarReader); err != nil {
				dst.Close()
				return err
			}
			dst.Close()
		}
	}
}

func locateSinglePayloadRoot(extractedDir string) (string, error) {
	entries, err := os.ReadDir(extractedDir)
	if err != nil {
		return "", err
	}
	dirs := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, filepath.Join(extractedDir, entry.Name()))
		}
	}
	if len(dirs) != 1 {
		return "", fmt.Errorf("expected exactly one extracted root directory, got %d", len(dirs))
	}
	return dirs[0], nil
}

func moveDirContents(srcDir, destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(srcDir, entry.Name())
		destPath := filepath.Join(destDir, entry.Name())
		if err := copyPath(srcPath, destPath, entry); err != nil {
			return err
		}
	}
	return nil
}

func copyPath(srcPath, destPath string, entry os.DirEntry) error {
	if entry.IsDir() {
		if err := os.MkdirAll(destPath, 0o755); err != nil {
			return err
		}
		children, err := os.ReadDir(srcPath)
		if err != nil {
			return err
		}
		for _, child := range children {
			if err := copyPath(filepath.Join(srcPath, child.Name()), filepath.Join(destPath, child.Name()), child); err != nil {
				return err
			}
		}
		return nil
	}

	info, err := entry.Info()
	if err != nil {
		return err
	}
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func managedBinaryPath(installDir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(installDir, executableName("node"))
	}
	return filepath.Join(installDir, "bin", executableName("node"))
}

func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func nvmExecutablePaths(homeDir, executable string) []string {
	base := filepath.Join(homeDir, ".nvm", "versions", "node")
	entries, err := os.ReadDir(base)
	if err != nil {
		return nil
	}

	versions := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "v") {
			versions = append(versions, entry.Name())
		}
	}
	sort.SliceStable(versions, func(i, j int) bool {
		return compareSemver(versions[i], versions[j]) > 0
	})

	paths := make([]string, 0, len(versions))
	for _, version := range versions {
		paths = append(paths, filepath.Join(base, version, "bin", executable))
	}
	return paths
}

func normalizeVersion(version string) string {
	version = strings.TrimSpace(version)
	if version == "" {
		return ""
	}
	if !strings.HasPrefix(version, "v") {
		version = "v" + version
	}
	return version
}

func compareSemver(a, b string) int {
	normalize := func(value string) []int {
		value = strings.TrimPrefix(normalizeVersion(value), "v")
		parts := strings.Split(value, ".")
		result := make([]int, 0, len(parts))
		for _, part := range parts {
			num, err := strconv.Atoi(part)
			if err != nil {
				num = 0
			}
			result = append(result, num)
		}
		return result
	}

	aParts := normalize(a)
	bParts := normalize(b)
	for i := 0; i < len(aParts) || i < len(bParts); i++ {
		av := 0
		bv := 0
		if i < len(aParts) {
			av = aParts[i]
		}
		if i < len(bParts) {
			bv = bParts[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return 0
}
