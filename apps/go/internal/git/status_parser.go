package git

import "strings"

func parsePorcelainStatus(output string) StatusLists {
	result := StatusLists{
		Staged:   []FileWithStatus{},
		Unstaged: []FileWithStatus{},
		Branch:   "HEAD",
	}

	for _, line := range strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n") {
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "## ") {
			result.Branch = parseBranchLine(strings.TrimPrefix(line, "## "))
			continue
		}

		if len(line) < 3 {
			continue
		}

		x := line[0]
		y := line[1]
		path := parsePorcelainPath(line[3:])

		if path == "" {
			continue
		}

		if isUnmergedStatus(x, y) {
			result.Unstaged = append(result.Unstaged, FileWithStatus{
				Path:   path,
				Status: "unmerged",
			})
			continue
		}

		if status := mapPorcelainStatus(x); status != "" && status != "untracked" {
			result.Staged = append(result.Staged, FileWithStatus{
				Path:   path,
				Status: status,
			})
		}

		if status := mapWorktreeStatus(x, y); status != "" {
			result.Unstaged = append(result.Unstaged, FileWithStatus{
				Path:   path,
				Status: status,
			})
		}
	}

	return result
}

func parseBranchLine(line string) string {
	line = strings.TrimSpace(line)
	if line == "" {
		return "HEAD"
	}
	if strings.HasPrefix(line, "HEAD ") || line == "HEAD" {
		return "HEAD"
	}
	if idx := strings.Index(line, "..."); idx >= 0 {
		line = line[:idx]
	}
	if idx := strings.Index(line, " "); idx >= 0 {
		line = line[:idx]
	}
	if line == "" {
		return "HEAD"
	}
	return line
}

func parsePorcelainPath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if idx := strings.Index(value, " -> "); idx >= 0 {
		return value[idx+4:]
	}
	return strings.Trim(value, `"`)
}

func mapWorktreeStatus(x, y byte) string {
	if x == '?' && y == '?' {
		return "untracked"
	}
	if x == '!' && y == '!' {
		return "ignored"
	}
	return mapPorcelainStatus(y)
}

func mapPorcelainStatus(code byte) string {
	switch code {
	case ' ', 0:
		return ""
	case 'M':
		return "modified"
	case 'A':
		return "added"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'T':
		return "typechanged"
	case '?':
		return "untracked"
	case '!':
		return "ignored"
	case 'U':
		return "unmerged"
	default:
		return strings.ToLower(string(code))
	}
}

func isUnmergedStatus(x, y byte) bool {
	switch string([]byte{x, y}) {
	case "DD", "AU", "UD", "UA", "DU", "AA", "UU":
		return true
	default:
		return false
	}
}
