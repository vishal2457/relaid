package acp

import (
	"encoding/json"
	"testing"
)

func TestAutoApprovePermissionPrefersAllow(t *testing.T) {
	params := map[string]any{
		"options": []map[string]any{
			{"optionId": "reject", "kind": "reject_once"},
			{"optionId": "allow", "kind": "allow_once"},
		},
	}

	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, rpcErr := autoApprovePermission(raw)
	if rpcErr != nil {
		t.Fatalf("unexpected rpc error: %v", rpcErr)
	}

	outcome := result["outcome"].(map[string]any)
	if outcome["optionId"] != "allow" {
		t.Fatalf("expected allow option, got %#v", outcome)
	}
}

func TestWithModelOverride(t *testing.T) {
	options := withModelOverride([]ConfigOption{
		{ID: "model", CurrentValue: "opencode/big-pickle"},
		{ID: "mode", CurrentValue: "build"},
	}, "mimo-v2-pro")

	if len(options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(options))
	}

	if options[0]["currentValue"] != "opencode/mimo-v2-pro" {
		t.Fatalf("expected opencode/mimo-v2-pro, got %#v", options[0]["currentValue"])
	}

	if options[1]["currentValue"] != "build" {
		t.Fatalf("unexpected mode value: %#v", options[1]["currentValue"])
	}
}

func TestWithModelOverrideModelID(t *testing.T) {
	options := withModelOverride([]ConfigOption{
		{ID: "model_id", CurrentValue: "opencode/big-pickle"},
		{ID: "temperature", CurrentValue: 0.7},
	}, "minimax-m2.7")

	if len(options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(options))
	}

	if options[0]["currentValue"] != "opencode/minimax-m2.7" {
		t.Fatalf("expected opencode/minimax-m2.7, got %#v", options[0]["currentValue"])
	}

	if options[1]["currentValue"] != 0.7 {
		t.Fatalf("unexpected temperature value: %#v", options[1]["currentValue"])
	}
}

func TestWithModelOverrideFullID(t *testing.T) {
	options := withModelOverride([]ConfigOption{
		{ID: "model", CurrentValue: "opencode/big-pickle"},
	}, "custom-provider/custom-model")

	if options[0]["currentValue"] != "custom-provider/custom-model" {
		t.Fatalf("expected custom-provider/custom-model, got %#v", options[0]["currentValue"])
	}
}
