package acp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestClientListSessions(t *testing.T) {
	script := writeTestScript(t, `#!/bin/sh
read line
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"sessionCapabilities":{"list":{}}}}}'
read line
printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"sessions":[{"sessionId":"ses_123","cwd":"/tmp/project","title":"Test Session","updatedAt":"2026-04-11T00:00:00Z"}],"nextCursor":"cursor_2"}}'
`)

	client := NewClient(script, "/tmp/project", nil)
	result, err := client.ListSessions(context.Background(), ClientInfo{
		Name:    "test-client",
		Version: "0.0.1",
	}, "")
	if err != nil {
		t.Fatalf("ListSessions returned error: %v", err)
	}

	if len(result.Sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(result.Sessions))
	}

	if result.Sessions[0].SessionID != "ses_123" {
		t.Fatalf("unexpected session id: %s", result.Sessions[0].SessionID)
	}

	if result.NextCursor != "cursor_2" {
		t.Fatalf("unexpected next cursor: %s", result.NextCursor)
	}
}

func TestClientListSessionsRequiresCapability(t *testing.T) {
	script := writeTestScript(t, `#!/bin/sh
read line
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"sessionCapabilities":{}}}}'
`)

	client := NewClient(script, "/tmp/project", nil)
	_, err := client.ListSessions(context.Background(), ClientInfo{
		Name:    "test-client",
		Version: "0.0.1",
	}, "")
	if err == nil {
		t.Fatal("expected missing capability error")
	}
}

func writeTestScript(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "mock-acp.sh")
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	return path
}
