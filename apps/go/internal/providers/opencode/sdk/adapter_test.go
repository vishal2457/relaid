package sdk

import "testing"

func TestEnsureClientRefreshesWhenBaseURLChanges(t *testing.T) {
	t.Parallel()

	urls := []string{
		"http://127.0.0.1:3001",
		"http://127.0.0.1:3002",
	}
	calls := 0

	adapter := NewLazy("/tmp", func() (string, error) {
		url := urls[calls]
		calls++
		return url, nil
	})

	firstClient, firstHTTP, err := adapter.ensureClient()
	if err != nil {
		t.Fatalf("ensure client first call: %v", err)
	}
	if firstClient == nil || firstHTTP == nil {
		t.Fatalf("expected initialized clients")
	}
	if firstHTTP.baseURL != urls[0] {
		t.Fatalf("expected first base URL %q, got %q", urls[0], firstHTTP.baseURL)
	}

	secondClient, secondHTTP, err := adapter.ensureClient()
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

	adapter := NewLazy("/tmp", func() (string, error) {
		calls++
		return baseURL, nil
	})

	firstClient, firstHTTP, err := adapter.ensureClient()
	if err != nil {
		t.Fatalf("ensure client first call: %v", err)
	}

	secondClient, secondHTTP, err := adapter.ensureClient()
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
