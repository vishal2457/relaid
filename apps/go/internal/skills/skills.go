package skills

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Skill struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Source      string `json:"source"`
}

type Tool string

const (
	ClaudeCode Tool = "claude"
	OpenCode   Tool = "opencode"
	Codex      Tool = "codex"
)

func LoadAll(tool Tool, projectDir string) ([]Skill, error) {
	paths := resolvePaths(tool, projectDir)
	seen := map[string]bool{}
	var skills []Skill

	for _, p := range paths {
		found, err := scanDir(p.dir, p.source)
		if err != nil {
			continue
		}
		for _, s := range found {
			if !seen[s.Location] {
				seen[s.Location] = true
				skills = append(skills, s)
			}
		}
	}
	return skills, nil
}

type searchPath struct {
	dir    string
	source string
}

func resolvePaths(tool Tool, projectDir string) []searchPath {
	home, _ := os.UserHomeDir()
	gitRoot := findGitRoot(projectDir)
	if gitRoot == "" {
		gitRoot = projectDir
	}

	switch tool {
	case ClaudeCode:
		return []searchPath{
			{filepath.Join(projectDir, ".claude", "skills"), "project"},
			{filepath.Join(home, ".claude", "skills"), "global"},
		}

	case OpenCode:
		var paths []searchPath
		for dir := projectDir; ; dir = filepath.Dir(dir) {
			paths = append(paths,
				searchPath{filepath.Join(dir, ".opencode", "skills"), "project"},
				searchPath{filepath.Join(dir, ".claude", "skills"), "project"},
				searchPath{filepath.Join(dir, ".agents", "skills"), "project"},
			)
			if dir == gitRoot || dir == filepath.Dir(dir) {
				break
			}
		}
		paths = append(paths,
			searchPath{filepath.Join(home, ".config", "opencode", "skills"), "global"},
			searchPath{filepath.Join(home, ".claude", "skills"), "global"},
			searchPath{filepath.Join(home, ".agents", "skills"), "global"},
		)
		return paths

	case Codex:
		var paths []searchPath
		for dir := projectDir; ; dir = filepath.Dir(dir) {
			paths = append(paths,
				searchPath{filepath.Join(dir, ".agents", "skills"), "project"},
				searchPath{filepath.Join(dir, ".codex", "skills"), "project"},
			)
			if dir == gitRoot || dir == filepath.Dir(dir) {
				break
			}
		}
		paths = append(paths,
			searchPath{filepath.Join(home, ".codex", "skills"), "global"},
		)
		return paths
	}
	return nil
}

func scanDir(dir, source string) ([]Skill, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var skills []Skill
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		skillFile := filepath.Join(dir, e.Name(), "SKILL.md")
		s, err := parseSkillFile(skillFile, source)
		if err != nil {
			continue
		}
		skills = append(skills, s)
	}
	return skills, nil
}

func parseSkillFile(path, source string) (Skill, error) {
	f, err := os.Open(path)
	if err != nil {
		return Skill{}, err
	}
	defer f.Close()

	skill := Skill{Location: path, Source: source}
	scanner := bufio.NewScanner(f)

	if !scanner.Scan() || strings.TrimSpace(scanner.Text()) != "---" {
		return skill, nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			break
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.Trim(strings.TrimSpace(val), `"'`)
		switch key {
		case "name":
			skill.Name = val
		case "description":
			skill.Description = val
		}
	}

	if skill.Name == "" {
		skill.Name = filepath.Base(filepath.Dir(path))
	}
	return skill, nil
}

func findGitRoot(dir string) string {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}