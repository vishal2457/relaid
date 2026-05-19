package codex

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"

	"relaid/internal/agent"

	opencode "github.com/sst/opencode-sdk-go"
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
	got := buildCollaborationModeSelection("plan", "")
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

func TestAgentServiceListUsesCanonicalModeName(t *testing.T) {
	result := []codexCollaborationMode{{
		Name:            "Plan",
		Mode:            "plan",
		Model:           ptr("gpt-5.4"),
		ReasoningEffort: ptr("high"),
	}}

	agents := make([]agent.AgentConfig, 0, len(result))
	for _, item := range result {
		modeID := normalizeCollaborationMode(item.Mode)
		agents = append(agents, agent.AgentConfig{
			Name:        modeID,
			Description: collaborationModeDescription(item),
			Mode:        "primary",
			BuiltIn:     true,
		})
	}

	if len(agents) != 1 {
		t.Fatalf("expected one agent, got %d", len(agents))
	}
	if agents[0].Name != "plan" {
		t.Fatalf("expected canonical mode name plan, got %q", agents[0].Name)
	}
	if !strings.Contains(agents[0].Description, "Reasoning: high") {
		t.Fatalf("expected description to keep mode metadata, got %q", agents[0].Description)
	}
}

func TestTurnStartParamsSerializeCollaborationMode(t *testing.T) {
	model := "gpt-5.4"
	effort := "high"
	payload, err := json.Marshal(turnStartParams{
		ThreadID: "thread-123",
		Input: []userInput{{
			Type: "text",
			Text: "hello",
		}},
		Model:          &model,
		ApprovalPolicy: "on-failure",
		Effort:         &effort,
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
	if !strings.Contains(jsonText, `"approvalPolicy":"on-failure"`) {
		t.Fatalf("expected approvalPolicy in payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"effort":"high"`) {
		t.Fatalf("expected effort in payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"collaborationMode":{"mode":"plan"`) {
		t.Fatalf("expected collaborationMode in payload, got %s", jsonText)
	}
}

func TestCodexApprovalPolicyValue(t *testing.T) {
	if got := codexApprovalPolicyValue(""); got != defaultCodexApprovalPolicy {
		t.Fatalf("expected default approval policy, got %q", got)
	}
	if got := codexApprovalPolicyValue("on-failure"); got != "on-failure" {
		t.Fatalf("expected on-failure, got %q", got)
	}
	if got := codexApprovalPolicyValue("invalid"); got != defaultCodexApprovalPolicy {
		t.Fatalf("expected default fallback, got %q", got)
	}
}

func TestCodexEffortToNil(t *testing.T) {
	if got := codexEffortToNil(""); got != nil {
		t.Fatalf("expected nil effort for empty input, got %v", got)
	}
	if got := codexEffortToNil("xhigh"); got == nil || *got != "xhigh" {
		t.Fatalf("expected xhigh effort, got %v", got)
	}
	if got := codexEffortToNil("invalid"); got != nil {
		t.Fatalf("expected nil effort fallback, got %v", got)
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

func TestAppendCodexTextDeltaWritesOutputAndChunk(t *testing.T) {
	var output strings.Builder
	var chunks []agent.StreamChunk
	appendCodexTextDelta(json.RawMessage(`{"itemId":"plan_1","delta":"hello"}`), &output, func(chunk agent.StreamChunk) {
		chunks = append(chunks, chunk)
	})

	if output.String() != "hello" {
		t.Fatalf("expected output to include delta, got %q", output.String())
	}
	if len(chunks) != 1 || chunks[0].Type != "text" || chunks[0].Content != "hello" {
		t.Fatalf("unexpected chunks: %+v", chunks)
	}
}

func TestEmitCodexPlanUpdateEmitsStatuses(t *testing.T) {
	var chunks []agent.StreamChunk
	emitCodexPlanUpdate(json.RawMessage(`{
		"explanation":"Collecting context",
		"plan":[
			{"step":"Inspect provider code","status":"in_progress"},
			{"step":"Patch stream handling","status":"pending"}
		]
	}`), func(chunk agent.StreamChunk) {
		chunks = append(chunks, chunk)
	})

	if len(chunks) != 3 {
		t.Fatalf("expected three status chunks, got %d", len(chunks))
	}
	if chunks[0].Content != "Collecting context" {
		t.Fatalf("unexpected explanation chunk: %+v", chunks[0])
	}
	if chunks[1].Content != "in_progress: Inspect provider code" {
		t.Fatalf("unexpected plan chunk: %+v", chunks[1])
	}
}

func TestDecodeCodexQuestionRequestAndAnswerMap(t *testing.T) {
	req, err := decodeCodexQuestionRequest(json.RawMessage(`{
		"threadId":"thr_123",
		"questions":[
			{
				"id":"mode",
				"header":"Mode",
				"question":"Choose a mode",
				"options":[
					{"label":"Plan","description":"Use plan mode"},
					{"label":"Custom","description":"Type your own","isOther":true}
				]
			},
			{
				"id":"files",
				"header":"Files",
				"question":"Pick files",
				"multiple":true,
				"options":[
					{"label":"provider.go","description":"Provider code"}
				]
			}
		]
	}`))
	if err != nil {
		t.Fatalf("decodeCodexQuestionRequest: %v", err)
	}
	if !req.Questions[0].Custom {
		t.Fatalf("expected isOther option to set Custom")
	}

	answerMap := req.answerMap([][]string{{"Plan"}, {"provider.go", " provider_test.go "}})
	want := map[string]any{
		"mode":  "Plan",
		"files": []string{"provider.go", "provider_test.go"},
	}
	if !reflect.DeepEqual(answerMap, want) {
		t.Fatalf("expected answers %v, got %v", want, answerMap)
	}
}

func TestCodexQuestionRequestEmptyAnswersAreDeterministic(t *testing.T) {
	req := codexQuestionRequest{
		Questions: []codexQuestionPrompt{
			{ID: "mode"},
			{ID: "files", Multiple: true},
		},
	}
	want := map[string]any{
		"mode":  "",
		"files": []string{},
	}
	if got := req.emptyAnswers(); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected empty answers %v, got %v", want, got)
	}
}

func TestMapCodexMessagesKeepsPlanVisibleAndReasoningSeparate(t *testing.T) {
	turns := []turn{{
		ID: "turn_1",
		Items: []json.RawMessage{
			json.RawMessage(`{"type":"userMessage","content":[{"type":"text","text":"Make a plan"}]}`),
			json.RawMessage(`{"type":"reasoning","summary":["thinking"]}`),
			json.RawMessage(`{"type":"plan","text":"<proposed_plan>\nplan\n</proposed_plan>"}`),
		},
	}}

	messages := mapCodexMessages("session_1", turns)
	if len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %d", len(messages))
	}
	assistant := messages[1]
	if len(assistant.Parts) != 2 {
		t.Fatalf("expected reasoning and plan parts, got %d", len(assistant.Parts))
	}
	if assistant.Parts[0].Type != opencode.PartTypeReasoning {
		t.Fatalf("expected first assistant part to be reasoning, got %s", assistant.Parts[0].Type)
	}
	if assistant.Parts[1].Type != opencode.PartTypeText {
		t.Fatalf("expected plan part to be visible text, got %s", assistant.Parts[1].Type)
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
