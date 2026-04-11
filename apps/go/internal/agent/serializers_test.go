package agent

import (
	"testing"
	"time"
)

func TestSerializeSession(t *testing.T) {
	start := time.UnixMilli(1000)
	end := time.UnixMilli(2000)
	duration := int64(1000)
	exitCode := 0

	payload := SerializeSession(Session{
		ID:         "ses_123",
		ProjectID:  "proj_123",
		Directory:  "/tmp/project",
		Title:      "Hello",
		Version:    "v1",
		Status:     SessionRunning,
		CreatedAt:  start,
		UpdatedAt:  end,
		StartedAt:  &start,
		EndedAt:    &end,
		DurationMs: &duration,
		ExitCode:   &exitCode,
		ShareURL:   "https://example.com/share",
	})

	if payload.ID != "ses_123" {
		t.Fatalf("unexpected session id: %s", payload.ID)
	}

	if payload.Time.Created != 1000 {
		t.Fatalf("unexpected created timestamp: %d", payload.Time.Created)
	}

	if payload.Share == nil || payload.Share.URL != "https://example.com/share" {
		t.Fatalf("expected share URL to be serialized")
	}

	if payload.Status != SessionRunning {
		t.Fatalf("unexpected status: %s", payload.Status)
	}
}

func TestSerializeProvider(t *testing.T) {
	payload := SerializeProvider(Provider{
		ID:   "opencode",
		Name: "OpenCode",
		Models: []Model{
			{ID: "provider/model-a", Name: "Model A"},
		},
	})

	if payload.ID != "opencode" {
		t.Fatalf("unexpected provider id: %s", payload.ID)
	}

	if len(payload.Models) != 1 || payload.Models[0].ID != "provider/model-a" {
		t.Fatalf("unexpected models payload: %#v", payload.Models)
	}
}
