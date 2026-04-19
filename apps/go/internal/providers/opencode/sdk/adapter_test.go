package sdk

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEnsureClientRefreshesWhenBaseURLChanges(t *testing.T) {
	t.Parallel()

	urls := []string{
		"http://127.0.0.1:3001",
		"http://127.0.0.1:3002",
	}
	calls := 0

	adapter := NewLazy("/tmp", func(context.Context) (string, error) {
		url := urls[calls]
		calls++
		return url, nil
	})

	firstClient, firstHTTP, err := adapter.ensureClient(context.Background())
	if err != nil {
		t.Fatalf("ensure client first call: %v", err)
	}
	if firstClient == nil || firstHTTP == nil {
		t.Fatalf("expected initialized clients")
	}
	if firstHTTP.baseURL != urls[0] {
		t.Fatalf("expected first base URL %q, got %q", urls[0], firstHTTP.baseURL)
	}

	secondClient, secondHTTP, err := adapter.ensureClient(context.Background())
	if err != nil {
		t.Fatalf("ensure client second call: %v", err)
	}
	if secondClient == nil || secondHTTP == nil {
		t.Fatalf("expected initialized clients on second call")
	}
	if secondHTTP.baseURL != urls[1] {
		t.Fatalf("expected refreshed base URL %q, got %q", urls[1], secondHTTP.baseURL)
	}
	if firstClient == secondClient {
		t.Fatalf("expected SDK client to be recreated when base URL changes")
	}
	if firstHTTP == secondHTTP {
		t.Fatalf("expected HTTP client to be recreated when base URL changes")
	}
}

func TestEnsureClientReusesClientsWhenBaseURLStaysTheSame(t *testing.T) {
	t.Parallel()

	const baseURL = "http://127.0.0.1:3001"
	calls := 0

	adapter := NewLazy("/tmp", func(context.Context) (string, error) {
		calls++
		return baseURL, nil
	})

	firstClient, firstHTTP, err := adapter.ensureClient(context.Background())
	if err != nil {
		t.Fatalf("ensure client first call: %v", err)
	}

	secondClient, secondHTTP, err := adapter.ensureClient(context.Background())
	if err != nil {
		t.Fatalf("ensure client second call: %v", err)
	}

	if calls != 2 {
		t.Fatalf("expected resolver to run on each ensure call, got %d", calls)
	}
	if firstClient != secondClient {
		t.Fatalf("expected SDK client to be reused when base URL is unchanged")
	}
	if firstHTTP != secondHTTP {
		t.Fatalf("expected HTTP client to be reused when base URL is unchanged")
	}
}

func TestListAgentsMapsHiddenFlag(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("directory"); got != "/workspace" {
			t.Fatalf("unexpected directory query: %q", got)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"name":"build","description":"Visible","mode":"primary","builtIn":true,"hidden":false},
			{"name":"compaction","description":"Hidden","mode":"primary","builtIn":true,"hidden":true}
		]`))
	}))
	defer server.Close()

	adapter := New(server.URL, "/workspace")

	agents, err := adapter.ListAgents(context.Background(), "/workspace")
	if err != nil {
		t.Fatalf("ListAgents returned error: %v", err)
	}
	if len(agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(agents))
	}

	if agents[0].Hidden {
		t.Fatalf("expected first agent to be visible")
	}
	if !agents[1].Hidden {
		t.Fatalf("expected second agent to be hidden")
	}
}
