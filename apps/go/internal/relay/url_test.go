package relay

import "testing"

func TestBuildRelayEndpointURLPreservesBasePathAndConvertsScheme(t *testing.T) {
	endpoint, err := buildRelayEndpointURL("wss://relay.example.com/base/", "/health")
	if err != nil {
		t.Fatalf("buildRelayEndpointURL returned error: %v", err)
	}

	if endpoint != "https://relay.example.com/base/health" {
		t.Fatalf("unexpected endpoint URL: %s", endpoint)
	}
}

func TestRelayWebSocketURLConvertsHTTPToWebSocket(t *testing.T) {
	u, err := relayWebSocketURL("https://relay.example.com/base")
	if err != nil {
		t.Fatalf("relayWebSocketURL returned error: %v", err)
	}

	if got := u.String(); got != "wss://relay.example.com/base" {
		t.Fatalf("unexpected websocket URL: %s", got)
	}
}
