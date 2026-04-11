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
		{ID: "model", CurrentValue: "default/model"},
		{ID: "mode", CurrentValue: "build"},
	}, "custom/model")

	if len(options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(options))
	}

	if options[0]["currentValue"] != "custom/model" {
		t.Fatalf("expected model override, got %#v", options[0]["currentValue"])
	}

	if options[1]["currentValue"] != "build" {
		t.Fatalf("unexpected mode value: %#v", options[1]["currentValue"])
	}
}
