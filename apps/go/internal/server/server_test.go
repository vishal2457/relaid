package server

import (
	"net"
	"testing"

	"relaid/internal/config"
)

type stubAddr string

func (a stubAddr) Network() string { return "tcp" }
func (a stubAddr) String() string  { return string(a) }

type stubListener struct {
	addr net.Addr
}

func (l stubListener) Accept() (net.Conn, error) { return nil, nil }
func (l stubListener) Close() error              { return nil }
func (l stubListener) Addr() net.Addr            { return l.addr }

func TestAddressUsesConfiguredAddressBeforeStart(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			ServerAddr: "127.0.0.1:8080",
		},
	}

	if got := s.Address(); got != "127.0.0.1:8080" {
		t.Fatalf("Address() = %q, want %q", got, "127.0.0.1:8080")
	}
}

func TestAddressUsesListenerAddressAfterStart(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			ServerAddr: "127.0.0.1:8080",
		},
		listener: stubListener{addr: stubAddr("127.0.0.1:43210")},
	}

	if got := s.Address(); got != "127.0.0.1:43210" {
		t.Fatalf("Address() = %q, want %q", got, "127.0.0.1:43210")
	}
}
