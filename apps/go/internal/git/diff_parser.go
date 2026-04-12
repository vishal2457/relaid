package git

import (
	"regexp"
	"strings"
)

type DiffLine struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

type DiffHunk struct {
	Header string     `json:"header"`
	Lines  []DiffLine `json:"lines"`
}

type FileDiff struct {
	FileName string     `json:"fileName"`
	Hunks    []DiffHunk `json:"hunks"`
}

var diffHeaderRe = regexp.MustCompile(`a/(.+?) b/(.+)`)

func ParseDiff(rawDiff string) []FileDiff {
	if strings.TrimSpace(rawDiff) == "" {
		return nil
	}

	var files []FileDiff
	blocks := regexp.MustCompile(`(?m)^diff --git`).Split(rawDiff, -1)

	for _, block := range blocks {
		if strings.TrimSpace(block) == "" {
			continue
		}
		lines := strings.Split(block, "\n")
		fileName := "unknown"
		if len(lines) > 0 {
			m := diffHeaderRe.FindStringSubmatch(lines[0])
			if len(m) >= 3 {
				fileName = m[2]
			}
		}

		var hunks []DiffHunk
		var currentHunk *DiffHunk
		hunkHeaderRe := regexp.MustCompile(`^@@`)

		for _, line := range lines {
			if hunkHeaderRe.MatchString(line) {
				if currentHunk != nil {
					hunks = append(hunks, *currentHunk)
				}
				currentHunk = &DiffHunk{Header: line}
			} else if currentHunk != nil {
				if strings.HasPrefix(line, "+") {
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{
						Type:    "add",
						Content: line[1:],
					})
				} else if strings.HasPrefix(line, "-") {
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{
						Type:    "remove",
						Content: line[1:],
					})
				} else {
					content := line
					if strings.HasPrefix(line, " ") {
						content = line[1:]
					}
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{
						Type:    "context",
						Content: content,
					})
				}
			}
		}
		if currentHunk != nil {
			hunks = append(hunks, *currentHunk)
		}

		files = append(files, FileDiff{
			FileName: fileName,
			Hunks:    hunks,
		})
	}

	return files
}
