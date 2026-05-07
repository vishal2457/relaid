package secrets

import "testing"

func TestServiceName(t *testing.T) {
	t.Setenv("RELAID_ENV", "")
	if got := serviceName(); got != "relaid" {
		t.Fatalf("expected prod default service name, got %q", got)
	}

	t.Setenv("RELAID_ENV", "production")
	if got := serviceName(); got != "relaid" {
		t.Fatalf("expected production service name, got %q", got)
	}

	t.Setenv("RELAID_ENV", "dev")
	if got := serviceName(); got != "relaid.dev" {
		t.Fatalf("expected dev service name, got %q", got)
	}

	t.Setenv("RELAID_ENV", "staging")
	if got := serviceName(); got != "relaid.staging" {
		t.Fatalf("expected staging service name, got %q", got)
	}
}
