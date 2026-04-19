package acp

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

type nopWriteCloser struct {
	bytes.Buffer
}

func (n *nopWriteCloser) Close() error {
	return nil
}

func TestCallHonorsContextTimeout(t *testing.T) {
	t.Parallel()

	connCtx, cancelConn := context.WithCancel(context.Background())
	defer cancelConn()

	conn := &Connection{
		ctx:     connCtx,
		cancel:  cancelConn,
		stdin:   &nopWriteCloser{},
		pending: make(map[int64]chan responseEnvelope),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := conn.call(ctx, "initialize", map[string]any{"hello": "world"}, nil)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected context deadline exceeded, got %v", err)
	}
	if time.Since(start) > 500*time.Millisecond {
		t.Fatalf("call did not return promptly after context timeout")
	}
}
