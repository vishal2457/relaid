package filesystem

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const maxFileReadBytes = 512 * 1024

type DirectoryEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"` // "file" | "directory"
}

type cacheEntry struct {
	entries   []DirectoryEntry
	expiresAt time.Time
}

type DirectoryService struct {
	cache sync.Map // key: "root\x00relPath" -> cacheEntry
	ttl   time.Duration
}

func NewDirectoryService() *DirectoryService {
	return &DirectoryService{ttl: 30 * time.Second}
}

var defaultIgnoreDirs = map[string]bool{
	".git":            true,
	"node_modules":    true,
	".next":           true,
	"dist":            true,
	"build":           true,
	"__pycache__":     true,
	".cache":          true,
	".venv":           true,
	"venv":            true,
	"vendor":          true,
	".idea":           true,
	".vscode":         true,
	"coverage":        true,
	".turbo":          true,
	".expo":           true,
	"tmp":             true,
	"temp":            true,
	".DS_Store":       true,
	"target":          true,
	"out":             true,
	".svelte-kit":     true,
	".nuxt":           true,
	".output":         true,
	".parcel-cache":   true,
	".yarn":           true,
	".pnpm-store":     true,
	"__snapshots__":   true,
}

var defaultIgnoreFiles = map[string]bool{
	".DS_Store": true,
}

func (s *DirectoryService) ListDir(root string, relPath string) ([]DirectoryEntry, error) {
	cacheKey := root + "\x00" + relPath
	if cached, ok := s.cache.Load(cacheKey); ok {
		entry := cached.(cacheEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.entries, nil
		}
	}

	absPath, cleanRelPath, err := resolveDirectoryPath(root, relPath)
	if err != nil {
		return nil, err
	}

	entries, err := s.readAndFilter(root, absPath, cleanRelPath)
	if err != nil {
		return nil, err
	}

	s.cache.Store(cacheKey, cacheEntry{
		entries:   entries,
		expiresAt: time.Now().Add(s.ttl),
	})

	return entries, nil
}

func (s *DirectoryService) Invalidate(root string) {
	s.cache.Range(func(key, _ any) bool {
		k := key.(string)
		if strings.HasPrefix(k, root+"\x00") {
			s.cache.Delete(k)
		}
		return true
	})
}

func (s *DirectoryService) ReadTextFile(root string, relPath string) (string, bool, error) {
	absPath, _, err := resolveDirectoryPath(root, relPath)
	if err != nil {
		return "", false, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", false, err
	}
	if info.IsDir() {
		return "", false, fmt.Errorf("path is a directory")
	}

	file, err := os.Open(absPath)
	if err != nil {
		return "", false, err
	}
	defer file.Close()

	buf := make([]byte, maxFileReadBytes+1)
	n, readErr := file.Read(buf)
	if readErr != nil && readErr != io.EOF {
		return "", false, readErr
	}

	content := buf[:n]
	truncated := false
	if len(content) > maxFileReadBytes {
		content = content[:maxFileReadBytes]
		truncated = true
	}
	if !utf8.Valid(content) {
		return "", false, fmt.Errorf("file is not valid UTF-8 text")
	}

	return string(content), truncated, nil
}

func (s *DirectoryService) readAndFilter(root string, absPath string, relPath string) ([]DirectoryEntry, error) {
	dirEntries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}

	// Collect candidate paths for gitignore filtering
	candidates := make([]string, 0, len(dirEntries))
	entryMap := make(map[string]os.DirEntry, len(dirEntries))
	for _, e := range dirEntries {
		name := e.Name()
		if defaultIgnoreFiles[name] {
			continue
		}
		if e.IsDir() && defaultIgnoreDirs[name] {
			continue
		}
		entryRelPath := name
		if relPath != "" {
			entryRelPath = filepath.Join(relPath, name)
		}
		candidates = append(candidates, entryRelPath)
		entryMap[entryRelPath] = e
	}

	// Filter via git check-ignore (batched, single call)
	ignored := s.gitCheckIgnore(root, candidates)

	result := make([]DirectoryEntry, 0, len(candidates))
	for _, rel := range candidates {
		if ignored[rel] {
			continue
		}
		e := entryMap[rel]
		entry := DirectoryEntry{
			Name: e.Name(),
			Path: rel,
			Type: "file",
		}
		if e.IsDir() {
			entry.Type = "directory"
		}
		result = append(result, entry)
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].Type != result[j].Type {
			return result[i].Type == "directory"
		}
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func (s *DirectoryService) gitCheckIgnore(root string, paths []string) map[string]bool {
	ignored := make(map[string]bool)
	if len(paths) == 0 {
		return ignored
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stdin := strings.Join(paths, "\x00")
	cmd := exec.CommandContext(ctx, "git", "check-ignore", "-z", "--stdin")
	cmd.Dir = root
	cmd.Stdin = bytes.NewReader([]byte(stdin))

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		// Exit code 1 means "none ignored" — not an error
		// Exit code 128 means "not a git repo" — also not an error for us
		return ignored
	}

	// Output is NUL-separated relative paths of ignored files
	parts := bytes.Split(stdout.Bytes(), []byte{0})
	for _, p := range parts {
		if len(p) > 0 {
			ignored[string(p)] = true
		}
	}

	return ignored
}

func resolveDirectoryPath(root string, relPath string) (string, string, error) {
	cleanRelPath := strings.TrimPrefix(filepath.Clean(relPath), ".")
	cleanRelPath = strings.TrimPrefix(cleanRelPath, string(filepath.Separator))

	absPath := root
	if cleanRelPath != "" {
		absPath = filepath.Join(root, cleanRelPath)
	}

	relToRoot, err := filepath.Rel(root, absPath)
	if err != nil {
		return "", "", err
	}
	if relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) {
		return "", "", os.ErrPermission
	}

	return absPath, cleanRelPath, nil
}
