package git

import "strings"

func parseStatusPorcelainV1Z(out string) ([]FileWithStatus, []FileWithStatus) {
	var staged, unstaged []FileWithStatus

	entries := strings.Split(out, "\x00")
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if entry == "" || len(entry) < 3 {
			continue
		}

		indexStatus := entry[0]
		worktreeStatus := entry[1]

		path := entry[2:]
		if entry[2] == ' ' && len(entry) > 3 {
			path = entry[3:]
		} else {
			path = strings.TrimLeft(path, " ")
		}
		if path == "" {
			continue
		}

		if status := mapIndexStatus(indexStatus); status != "" {
			staged = append(staged, FileWithStatus{Path: path, Status: status})
		}
		if status := mapWorktreeStatus(worktreeStatus); status != "" {
			unstaged = append(unstaged, FileWithStatus{Path: path, Status: status})
		}

		if indexStatus == 'R' || indexStatus == 'C' || worktreeStatus == 'R' || worktreeStatus == 'C' {
			i++
		}
	}

	return staged, unstaged
}

func mapIndexStatus(code byte) string {
	switch code {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'T':
		return "typechanged"
	case 'U':
		return "unmerged"
	default:
		return ""
	}
}

func mapWorktreeStatus(code byte) string {
	switch code {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'T':
		return "typechanged"
	case 'U':
		return "unmerged"
	case '?':
		return "untracked"
	case '!':
		return "ignored"
	default:
		return ""
	}
}
