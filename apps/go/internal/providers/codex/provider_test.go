package codex

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestEnvWithExecutableDirPrependsBinaryDir(t *testing.T) {
	t.Setenv("PATH", "/usr/bin:/bin")

	env := envWithExecutableDir("/tmp/node/bin/codex")
	path := envValue(env, "PATH")
	if !strings.HasPrefix(path, "/tmp/node/bin"+string(os.PathListSeparator)) {
		t.Fatalf("expected binary directory to be prepended to PATH, got %q", path)
	}
}

func TestEnvWithExecutableDirLeavesRelativeCommandUnchanged(t *testing.T) {
	if env := envWithExecutableDir("codex"); env != nil {
		t.Fatalf("expected nil env for relative command, got %v", env)
	}
}

func TestBuildCollaborationModeSelectionUsesBuiltInInstructionsByDefault(t *testing.T) {
	got := buildCollaborationModeSelection("Plan", "")
	if got == nil {
		t.Fatalf("expected collaboration mode selection")
	}
	if got.Mode != "plan" {
		t.Fatalf("expected mode plan, got %q", got.Mode)
	}

	wantSettings := map[string]any{"developer_instructions": nil}
	if !reflect.DeepEqual(got.Settings, wantSettings) {
		t.Fatalf("expected settings %v, got %v", wantSettings, got.Settings)
	}
}

func TestBuildCollaborationModeSelectionIncludesCustomInstructions(t *testing.T) {
	got := buildCollaborationModeSelection("default", "Follow the repo style guide.")
	if got == nil {
		t.Fatalf("expected collaboration mode selection")
	}
	if got.Mode != "default" {
		t.Fatalf("expected mode default, got %q", got.Mode)
	}

	wantSettings := map[string]any{"developer_instructions": "Follow the repo style guide."}
	if !reflect.DeepEqual(got.Settings, wantSettings) {
		t.Fatalf("expected settings %v, got %v", wantSettings, got.Settings)
	}
}

func TestBuildCollaborationModeSelectionReturnsNilForEmptyAgent(t *testing.T) {
	if got := buildCollaborationModeSelection("", ""); got != nil {
		t.Fatalf("expected nil selection for empty agent, got %+v", got)
	}
}

func TestTurnStartParamsSerializeCollaborationMode(t *testing.T) {
	model := "gpt-5.4"
	payload, err := json.Marshal(turnStartParams{
		ThreadID: "thread-123",
		Input: []userInput{{
			Type: "text",
			Text: "hello",
		}},
		Model: &model,
		CollaborationMode: &collaborationModeSelection{
			Mode: "plan",
			Settings: map[string]any{
				"developer_instructions": nil,
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal turnStartParams: %v", err)
	}

	jsonText := string(payload)
	if !strings.Contains(jsonText, `"model":"gpt-5.4"`) {
		t.Fatalf("expected model in payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"collaborationMode":{"mode":"plan"`) {
		t.Fatalf("expected collaborationMode in payload, got %s", jsonText)
	}
}

func TestIsTurnStartCollaborationModeRejected(t *testing.T) {
	if !isTurnStartCollaborationModeRejected(
		errors.New("Invalid request: missing field `model`"),
	) {
		t.Fatalf("expected missing-model error to trigger compatibility retry")
	}
	if isTurnStartCollaborationModeRejected(errors.New("thread not loaded")) {
		t.Fatalf("expected unrelated errors to skip compatibility retry")
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, item := range env {
		if strings.HasPrefix(item, prefix) {
			return strings.TrimPrefix(item, prefix)
		}
	}
	return ""
}
