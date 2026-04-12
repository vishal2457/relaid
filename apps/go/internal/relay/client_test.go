package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

func TestClientConnectsAndReconnects(t *testing.T) {
	var attempts atomic.Int32
	connects := make(chan struct{}, 2)
	events := make(chan string, 1)
	serverErrors := make(chan error, 4)

	mux := http.NewServeMux()
	mux.HandleFunc("/base/socket/", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("EIO"); got != "4" {
			serverErrors <- newTestError("unexpected EIO version: " + got)
			http.Error(w, "bad eio", http.StatusBadRequest)
			return
		}

		if got := r.URL.Query().Get("transport"); got != "websocket" {
			serverErrors <- newTestError("unexpected transport: " + got)
			http.Error(w, "bad transport", http.StatusBadRequest)
			return
		}

		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			serverErrors <- err
			return
		}

		attempt := attempts.Add(1)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		defer conn.Close(websocket.StatusNormalClosure, "test handler complete")

		if err := conn.Write(ctx, websocket.MessageText, []byte(`0{"sid":"engine-test","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)); err != nil {
			serverErrors <- err
			return
		}

		raw, err := readServerText(ctx, conn)
		if err != nil {
			serverErrors <- err
			return
		}

		auth, err := DecodeSIOConnect(raw)
		if err != nil {
			serverErrors <- err
			return
		}

		if auth["serverId"] != "server-1" {
			serverErrors <- newTestError("unexpected serverId")
			return
		}

		if auth["serverSecret"] != "secret-1" {
			serverErrors <- newTestError("unexpected serverSecret")
			return
		}

		if err := conn.Write(ctx, websocket.MessageText, []byte(`40{"sid":"socket-test"}`)); err != nil {
			serverErrors <- err
			return
		}

		if attempt == 1 {
			_ = conn.Close(websocket.StatusNormalClosure, "force reconnect")
			return
		}

		payload, err := json.Marshal(map[string]string{"requestId": "req-1"})
		if err != nil {
			serverErrors <- err
			return
		}

		if err := conn.Write(ctx, websocket.MessageText, []byte(EncodeSIOEvent(EventProjectsListRequest, json.RawMessage(payload)))); err != nil {
			serverErrors <- err
			return
		}

		<-ctx.Done()
	})

	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Skipf("sandbox does not allow loopback listeners: %v", err)
	}

	httpServer := &http.Server{Handler: mux}
	go func() {
		_ = httpServer.Serve(listener)
	}()
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	baseURL := fmt.Sprintf("http://%s", listener.Addr().String())

	client := NewClient(ClientOptions{
		RelayURL:          baseURL + "/base",
		ServerID:          "server-1",
		ServerSecret:      "secret-1",
		ServerName:        "Derived Test Server",
		ReconnectInterval: 50 * time.Millisecond,
		MaxReconnectDelay: 100 * time.Millisecond,
		OnConnect: func() {
			connects <- struct{}{}
		},
		OnEvent: func(event string, _ []json.RawMessage) {
			events <- event
		},
	})
	defer client.Close()

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	waitForSignal(t, connects, "initial connection")
	waitForSignal(t, connects, "reconnection")

	select {
	case err := <-serverErrors:
		t.Fatalf("test websocket server failed: %v", err)
	default:
	}

	select {
	case event := <-events:
		if event != EventProjectsListRequest {
			t.Fatalf("unexpected event: %s", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for relay event after reconnect")
	}

	if !client.IsConnected() {
		t.Fatal("expected client to remain connected after reconnect")
	}
}

func waitForSignal(t *testing.T, ch <-chan struct{}, label string) {
	t.Helper()

	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
	}
}

func readServerText(ctx context.Context, conn *websocket.Conn) (string, error) {
	for {
		msgType, data, err := conn.Read(ctx)
		if err != nil {
			return "", err
		}

		if msgType != websocket.MessageText {
			continue
		}

		return string(data), nil
	}
}

type testError string

func (e testError) Error() string {
	return string(e)
}

func newTestError(message string) error {
	return testError(message)
}
