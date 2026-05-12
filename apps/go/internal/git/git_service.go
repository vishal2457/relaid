package git

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type Result[T any] struct {
	Success bool
	Data    T
	Error   string
}

func ok[T any](data T) Result[T] {
	return Result[T]{Success: true, Data: data}
}

func fail[T any](errMsg string) Result[T] {
	return Result[T]{Success: false, Error: errMsg}
}

type FileWithStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type StatusLists struct {
	Staged   []FileWithStatus `json:"staged"`
	Unstaged []FileWithStatus `json:"unstaged"`
	Branch   string           `json:"branch"`
}

type StatusResultData struct {
	Status StatusLists `json:"status"`
}

type CommitResultData struct {
	Hash   string      `json:"hash"`
	Status StatusLists `json:"status"`
}

type OutputStatusResultData struct {
	Output  string      `json:"output"`
	Status  StatusLists `json:"status"`
	Changed bool        `json:"changed"`
}

type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
	IsRemote  bool   `json:"isRemote"`
	Commit    string `json:"commit"`
}

type RemoteInfo struct {
	Name     string `json:"name"`
	FetchURL string `json:"fetchUrl"`
	PushURL  string `json:"pushUrl"`
}

type CommitInfo struct {
	Hash      string `json:"hash"`
	ShortHash string `json:"shortHash"`
	Author    string `json:"author"`
	Date      string `json:"date"`
	Message   string `json:"message"`
}

type Service struct {
	cwd string
}

func NewService(cwd string) *Service {
	return &Service{cwd: cwd}
}

func (s *Service) handleError(operation string, err error) {
	log.Printf("git.%s failed: %v (cwd=%s)", operation, err, s.cwd)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// =====================
// Repository
// =====================

func (s *Service) IsGitRepository() bool {
	_, err := git.PlainOpen(s.cwd)
	return err == nil
}

func (s *Service) IsClean() bool {
	out, err := runGit(s.cwd, "status", "--porcelain")
	if err != nil {
		return false
	}
	return strings.TrimSpace(out) == ""
}

func (s *Service) Init() Result[string] {
	_, err := git.PlainInit(s.cwd, false)
	if err != nil {
		s.handleError("init", err)
		return fail[string](err.Error())
	}
	log.Printf("Initialized git repo (cwd=%s)", s.cwd)
	return ok("Initialized")
}

// =====================
// Branches
// =====================

func (s *Service) GetCurrentBranch() Result[string] {
	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("getCurrentBranch", err)
		return fail[string](err.Error())
	}
	ref, err := repo.Head()
	if err != nil {
		s.handleError("getCurrentBranch", err)
		return fail[string](err.Error())
	}
	name := ref.Name().Short()
	return ok(name)
}

func (s *Service) ListBranches(includeRemote bool) Result[[]BranchInfo] {
	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("listBranches", err)
		return fail[[]BranchInfo](err.Error())
	}

	branches, err := repo.Branches()
	if err != nil {
		s.handleError("listBranches", err)
		return fail[[]BranchInfo](err.Error())
	}

	head, _ := repo.Head()
	headName := ""
	if head != nil {
		headName = head.Name().Short()
	}

	var result []BranchInfo
	branches.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().Short()
		isRemote := ref.Name().IsRemote()
		if !includeRemote && isRemote {
			return nil
		}
		commit := ref.Hash().String()
		result = append(result, BranchInfo{
			Name:      name,
			IsCurrent: name == headName,
			IsRemote:  isRemote,
			Commit:    commit,
		})
		return nil
	})

	return ok(result)
}

func (s *Service) CreateBranch(name string, startPoint string) Result[string] {
	args := []string{"checkout", "-b", name}
	if startPoint != "" {
		args = append(args, startPoint)
	}
	_, err := runGit(s.cwd, args...)
	if err != nil {
		s.handleError("createBranch", err)
		return fail[string](err.Error())
	}
	log.Printf("Created and switched to branch %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

func (s *Service) SwitchBranch(name string) Result[string] {
	_, err := runGit(s.cwd, "checkout", name)
	if err != nil {
		s.handleError("switchBranch", err)
		return fail[string](err.Error())
	}
	log.Printf("Switched to branch %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

func (s *Service) DeleteBranch(name string, force bool) Result[string] {
	arg := "-d"
	if force {
		arg = "-D"
	}
	_, err := runGit(s.cwd, "branch", arg, name)
	if err != nil {
		s.handleError("deleteBranch", err)
		return fail[string](err.Error())
	}
	log.Printf("Deleted branch %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

// =====================
// Staging / Status
// =====================

func (s *Service) GetFileStatusLists() Result[StatusLists] {
	out, err := runGitWithTimeout(s.cwd, statusGitTimeout, "status", "--porcelain=v1", "-b")
	if err != nil {
		s.handleError("getFileStatusLists", err)
		return fail[StatusLists](err.Error())
	}
	return ok(parsePorcelainStatus(out))
}

func (s *Service) AddFiles(files []string) Result[StatusResultData] {
	if len(files) == 0 {
		return fail[StatusResultData]("No files specified")
	}
	args := append([]string{"add", "--"}, files...)
	_, err := runGitWithTimeout(s.cwd, mutateGitTimeout, args...)
	if err != nil {
		s.handleError("addFiles", err)
		return fail[StatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[StatusResultData](statusResult.Error)
	}
	log.Printf("Staged %d file(s) (cwd=%s)", len(files), s.cwd)
	return ok(StatusResultData{Status: statusResult.Data})
}

func (s *Service) AddAll() Result[StatusResultData] {
	_, err := runGitWithTimeout(s.cwd, mutateGitTimeout, "add", "-A")
	if err != nil {
		s.handleError("addAll", err)
		return fail[StatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[StatusResultData](statusResult.Error)
	}
	log.Printf("Staged all changes (cwd=%s)", s.cwd)
	return ok(StatusResultData{Status: statusResult.Data})
}

func (s *Service) UnstageFiles(files []string) Result[StatusResultData] {
	if len(files) == 0 {
		return fail[StatusResultData]("No files specified")
	}
	args := append([]string{"restore", "--staged", "--"}, files...)
	_, err := runGitWithTimeout(s.cwd, mutateGitTimeout, args...)
	if err != nil {
		s.handleError("unstageFiles", err)
		return fail[StatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[StatusResultData](statusResult.Error)
	}
	log.Printf("Unstaged %d file(s) (cwd=%s)", len(files), s.cwd)
	return ok(StatusResultData{Status: statusResult.Data})
}

func (s *Service) DiscardChanges(files []string) Result[string] {
	if len(files) == 0 {
		return fail[string]("No files specified")
	}

	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("discardChanges", err)
		return fail[string](err.Error())
	}
	w, err := repo.Worktree()
	if err != nil {
		s.handleError("discardChanges", err)
		return fail[string](err.Error())
	}
	status, err := w.Status()
	if err != nil {
		s.handleError("discardChanges", err)
		return fail[string](err.Error())
	}

	var trackedFiles, untrackedFiles []string
	for _, f := range files {
		s2, exists := status[f]
		if !exists {
			continue
		}
		wCode := string(s2.Worktree)
		stagingCode := string(s2.Staging)
		if wCode == "?" || stagingCode == "?" {
			untrackedFiles = append(untrackedFiles, f)
		} else {
			trackedFiles = append(trackedFiles, f)
		}
	}

	if len(trackedFiles) > 0 {
		if hasStaged(status) {
			args := append([]string{"reset", "HEAD", "--"}, trackedFiles...)
			runGit(s.cwd, args...)
		}
		args := append([]string{"checkout", "--"}, trackedFiles...)
		if _, err := runGit(s.cwd, args...); err != nil {
			s.handleError("discardChanges", err)
			return fail[string](err.Error())
		}
	}

	for _, f := range untrackedFiles {
		fullPath := filepath.Join(s.cwd, f)
		os.RemoveAll(fullPath)
	}

	log.Printf("Discarded changes in %d file(s) (cwd=%s)", len(files), s.cwd)
	return ok(fmt.Sprintf("Discarded changes in %d file(s)", len(files)))
}

func hasStaged(status git.Status) bool {
	for _, s2 := range status {
		if s2.Staging != git.Unmodified && s2.Staging != git.Untracked {
			return true
		}
	}
	return false
}

func (s *Service) GetFileContent(filePath string) Result[string] {
	out, err := runGit(s.cwd, "show", "HEAD:"+filePath)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") || strings.Contains(out, "does not exist") {
			return fail[string]("File does not exist in HEAD")
		}
		s.handleError("getFileContent", err)
		return fail[string](err.Error())
	}
	return ok(out)
}

// =====================
// Commit
// =====================

func (s *Service) Commit(message string, files []string) Result[CommitResultData] {
	message = strings.TrimSpace(message)
	if message == "" {
		return fail[CommitResultData]("Commit message is required")
	}

	args := []string{"commit", "--quiet", "-m", message}
	if len(files) > 0 {
		args = append(args, "--")
		args = append(args, files...)
	}

	if _, err := runGitWithTimeout(s.cwd, mutateGitTimeout, args...); err != nil {
		s.handleError("commit", err)
		return fail[CommitResultData](err.Error())
	}

	hash, err := runGitWithTimeout(s.cwd, mutateGitTimeout, "rev-parse", "HEAD")
	if err != nil {
		s.handleError("commit", err)
		return fail[CommitResultData](err.Error())
	}

	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[CommitResultData](statusResult.Error)
	}

	log.Printf("Created commit %s (cwd=%s)", hash, s.cwd)
	return ok(CommitResultData{
		Hash:   hash,
		Status: statusResult.Data,
	})
}

// =====================
// Push / Pull / Fetch
// =====================

func (s *Service) Push(remote string, branch string, setUpstream bool) Result[OutputStatusResultData] {
	args := []string{"push"}
	if setUpstream {
		args = append(args, "--set-upstream")
	}
	if remote != "" {
		args = append(args, remote)
	}
	if branch != "" {
		args = append(args, branch)
	}
	result, err := runGitDetailed(s.cwd, networkGitTimeout, args...)
	if err != nil {
		s.handleError("push", err)
		return fail[OutputStatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[OutputStatusResultData](statusResult.Error)
	}
	log.Printf("Pushed to %s/%s (cwd=%s)", remote, branch, s.cwd)
	return ok(OutputStatusResultData{
		Output:  firstNonEmpty(result.Stdout, result.Stderr, "Pushed successfully"),
		Status:  statusResult.Data,
		Changed: true,
	})
}

func (s *Service) Pull(remote string, branch string) Result[OutputStatusResultData] {
	args := []string{"pull"}
	if remote != "" {
		args = append(args, remote)
	}
	if branch != "" {
		args = append(args, branch)
	}
	result, err := runGitDetailed(s.cwd, networkGitTimeout, args...)
	if err != nil {
		s.handleError("pull", err)
		return fail[OutputStatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[OutputStatusResultData](statusResult.Error)
	}
	output := firstNonEmpty(result.Stdout, result.Stderr, "Pull complete")
	log.Printf("Pulled from %s/%s (cwd=%s)", remote, branch, s.cwd)
	return ok(OutputStatusResultData{
		Output:  output,
		Status:  statusResult.Data,
		Changed: !strings.Contains(output, "Already up to date."),
	})
}

func (s *Service) Fetch(remote string) Result[OutputStatusResultData] {
	args := []string{"fetch"}
	if remote != "" {
		args = append(args, remote)
	}
	result, err := runGitDetailed(s.cwd, networkGitTimeout, args...)
	if err != nil {
		s.handleError("fetch", err)
		return fail[OutputStatusResultData](err.Error())
	}
	statusResult := s.GetFileStatusLists()
	if !statusResult.Success {
		return fail[OutputStatusResultData](statusResult.Error)
	}
	output := firstNonEmpty(result.Stdout, result.Stderr, fmt.Sprintf("Fetched from %s", remote))
	log.Printf("Fetched from %s (cwd=%s)", remote, s.cwd)
	return ok(OutputStatusResultData{
		Output:  output,
		Status:  statusResult.Data,
		Changed: !strings.Contains(output, "up to date"),
	})
}

// =====================
// Log
// =====================

func (s *Service) Log(count int) Result[[]CommitInfo] {
	if count <= 0 {
		count = 10
	}

	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("log", err)
		return fail[[]CommitInfo](err.Error())
	}

	head, err := repo.Head()
	if err != nil {
		s.handleError("log", err)
		return fail[[]CommitInfo](err.Error())
	}

	commitIter, err := repo.Log(&git.LogOptions{From: head.Hash()})
	if err != nil {
		s.handleError("log", err)
		return fail[[]CommitInfo](err.Error())
	}

	var commits []CommitInfo
	err = commitIter.ForEach(func(c *object.Commit) error {
		if len(commits) >= count {
			return fmt.Errorf("stop")
		}
		commits = append(commits, CommitInfo{
			Hash:      c.Hash.String(),
			ShortHash: c.Hash.String()[:7],
			Author:    c.Author.Name,
			Date:      c.Author.When.Format("2006-01-02 15:04:05 -0700"),
			Message:   c.Message,
		})
		return nil
	})

	return ok(commits)
}

// =====================
// Remotes
// =====================

func (s *Service) GetRemotes() Result[[]RemoteInfo] {
	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("getRemotes", err)
		return fail[[]RemoteInfo](err.Error())
	}

	remotes, err := repo.Remotes()
	if err != nil {
		s.handleError("getRemotes", err)
		return fail[[]RemoteInfo](err.Error())
	}

	var result []RemoteInfo
	for _, r := range remotes {
		config := r.Config()
		fetchURL := ""
		pushURL := ""
		if len(config.URLs) > 0 {
			fetchURL = config.URLs[0]
			pushURL = config.URLs[0]
		}
		result = append(result, RemoteInfo{
			Name:     config.Name,
			FetchURL: fetchURL,
			PushURL:  pushURL,
		})
	}
	return ok(result)
}

func (s *Service) AddRemote(name, url string) Result[string] {
	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("addRemote", err)
		return fail[string](err.Error())
	}
	_, err = repo.CreateRemote(&config.RemoteConfig{
		Name: name,
		URLs: []string{url},
	})
	if err != nil {
		s.handleError("addRemote", err)
		return fail[string](err.Error())
	}
	log.Printf("Added remote %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

func (s *Service) RemoveRemote(name string) Result[string] {
	repo, err := git.PlainOpen(s.cwd)
	if err != nil {
		s.handleError("removeRemote", err)
		return fail[string](err.Error())
	}
	err = repo.DeleteRemote(name)
	if err != nil {
		s.handleError("removeRemote", err)
		return fail[string](err.Error())
	}
	log.Printf("Removed remote %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

// =====================
// Diff
// =====================

func (s *Service) DiffStaged() Result[string] {
	out, err := runGit(s.cwd, "diff", "--cached")
	if err != nil {
		s.handleError("diffStaged", err)
		return fail[string](err.Error())
	}
	return ok(out)
}

func (s *Service) DiffUnstaged() Result[string] {
	out, err := runGit(s.cwd, "diff")
	if err != nil {
		s.handleError("diffUnstaged", err)
		return fail[string](err.Error())
	}
	return ok(out)
}

func (s *Service) DiffFile(filePath string) Result[[]FileDiff] {
	out, err := runGit(s.cwd, "diff", "HEAD", "--", filePath)
	if err != nil {
		s.handleError("diffFile", err)
		return fail[[]FileDiff](err.Error())
	}

	if strings.TrimSpace(out) == "" {
		statusResult := s.GetFileStatusLists()
		isNewFile := false
		if statusResult.Success {
			for _, f := range statusResult.Data.Unstaged {
				if f.Path == filePath && (f.Status == "untracked" || f.Status == "added" || f.Status == "copied") {
					isNewFile = true
					break
				}
			}
			for _, f := range statusResult.Data.Staged {
				if f.Path == filePath && f.Status == "added" {
					isNewFile = true
					break
				}
			}
		}

		if isNewFile {
			fullPath := filepath.Join(s.cwd, filePath)
			content, err := os.ReadFile(fullPath)
			if err != nil {
				return ok([]FileDiff{})
			}
			lines := strings.Split(string(content), "\n")
			var diffLines []DiffLine
			for _, line := range lines {
				diffLines = append(diffLines, DiffLine{
					Type:    "add",
					Content: line,
				})
			}
			header := fmt.Sprintf("@@ -0,0 +1,%d @@", len(lines))
			return ok([]FileDiff{{
				FileName: filePath,
				Hunks:    []DiffHunk{{Header: header, Lines: diffLines}},
			}})
		}

		return ok([]FileDiff{})
	}

	parsed := ParseDiff(out)
	return ok(parsed)
}

// =====================
// Stash
// =====================

func (s *Service) Stash(message string) Result[string] {
	args := []string{"stash"}
	if message != "" {
		args = []string{"stash", "save", message}
	}
	out, err := runGit(s.cwd, args...)
	if err != nil {
		s.handleError("stash", err)
		return fail[string](err.Error())
	}
	log.Printf("Stashed changes (cwd=%s)", s.cwd)
	return ok(out)
}

func (s *Service) StashPop() Result[string] {
	out, err := runGit(s.cwd, "stash", "pop")
	if err != nil {
		s.handleError("stashPop", err)
		return fail[string](err.Error())
	}
	log.Printf("Popped stash (cwd=%s)", s.cwd)
	return ok(out)
}

// =====================
// Merge
// =====================

func (s *Service) Merge(branch string, message string) Result[string] {
	args := []string{"merge"}
	if message != "" {
		args = append(args, "-m", message)
	}
	args = append(args, branch)
	out, err := runGit(s.cwd, args...)
	if err != nil {
		s.handleError("merge", err)
		return fail[string](err.Error())
	}
	log.Printf("Merged branch %s (cwd=%s)", branch, s.cwd)
	return ok(out)
}

// =====================
// Rebase
// =====================

func (s *Service) Rebase(branch string) Result[string] {
	_, err := runGit(s.cwd, "rebase", branch)
	if err != nil {
		s.handleError("rebase", err)
		return fail[string](err.Error())
	}
	log.Printf("Rebased onto %s (cwd=%s)", branch, s.cwd)
	return ok("Rebased")
}

func (s *Service) RebaseAbort() Result[string] {
	_, err := runGit(s.cwd, "rebase", "--abort")
	if err != nil {
		s.handleError("rebaseAbort", err)
		return fail[string](err.Error())
	}
	log.Printf("Aborted rebase (cwd=%s)", s.cwd)
	return ok("Rebase aborted")
}

// =====================
// Tags
// =====================

func (s *Service) CreateTag(name string, message string) Result[string] {
	args := []string{"tag"}
	if message != "" {
		args = append(args, "-a", name, "-m", message)
	} else {
		args = append(args, name)
	}
	_, err := runGit(s.cwd, args...)
	if err != nil {
		s.handleError("createTag", err)
		return fail[string](err.Error())
	}
	log.Printf("Created tag %s (cwd=%s)", name, s.cwd)
	return ok(name)
}

func (s *Service) ListTags() Result[[]string] {
	out, err := runGit(s.cwd, "tag", "--sort=-creatordate")
	if err != nil {
		s.handleError("listTags", err)
		return fail[[]string](err.Error())
	}
	if strings.TrimSpace(out) == "" {
		return ok([]string{})
	}
	return ok(strings.Split(out, "\n"))
}

// =====================
// Reset
// =====================

func (s *Service) Reset(mode string, ref string) Result[string] {
	if ref == "" {
		ref = "HEAD"
	}
	var modeFlag string
	switch mode {
	case "soft":
		modeFlag = "--soft"
	case "mixed":
		modeFlag = "--mixed"
	case "hard":
		modeFlag = "--hard"
	default:
		modeFlag = "--mixed"
	}
	_, err := runGit(s.cwd, "reset", modeFlag, ref)
	if err != nil {
		s.handleError("reset", err)
		return fail[string](err.Error())
	}
	log.Printf("Reset %s to %s (cwd=%s)", mode, ref, s.cwd)
	return ok(fmt.Sprintf("Reset %s to %s", mode, ref))
}
