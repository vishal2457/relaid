package relay

import (
	"log"
	"sync"
	"sync/atomic"
	"time"

	"nhooyr.io/websocket"

	"context"
	"encoding/json"
	"fmt"
)

type EventCallback func(event string, args []json.RawMessage)

type Client struct {
	relayURL     string
	serverID     string
	serverSecret string
	serverName   string

	writeMu sync.Mutex

	conn      *websocket.Conn
	mu        sync.Mutex
	connected bool

	onEvent      EventCallback
	onConnect    func()
	onDisconnect func(reason string)

	ctx    context.Context
	cancel context.CancelFunc

	reconnectInterval time.Duration
	maxReconnectDelay time.Duration
	logger            *log.Logger

	startOnce sync.Once
	doneOnce  sync.Once
	started   atomic.Bool
	done      chan struct{}
}

type ClientOptions struct {
	RelayURL          string
	ServerID          string
	ServerSecret      string
	ServerName        string
	ReconnectInterval time.Duration
	MaxReconnectDelay time.Duration
	Logger            *log.Logger
	OnEvent           EventCallback
	OnConnect         func()
	OnDisconnect      func(reason string)
}

func NewClient(opts ClientOptions) *Client {
	if opts.ReconnectInterval == 0 {
		opts.ReconnectInterval = 5 * time.Second
	}
	if opts.MaxReconnectDelay == 0 {
		opts.MaxReconnectDelay = 30 * time.Second
	}
	if opts.Logger == nil {
		opts.Logger = log.Default()
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Client{
		relayURL:          opts.RelayURL,
		serverID:          opts.ServerID,
		serverSecret:      opts.ServerSecret,
		serverName:        opts.ServerName,
		reconnectInterval: opts.ReconnectInterval,
		maxReconnectDelay: opts.MaxReconnectDelay,
		logger:            opts.Logger,
		onEvent:           opts.OnEvent,
		onConnect:         opts.OnConnect,
		onDisconnect:      opts.OnDisconnect,
		ctx:               ctx,
		cancel:            cancel,
		done:              make(chan struct{}),
	}
}

func (c *Client) Connect() error {
	c.startOnce.Do(func() {
		c.started.Store(true)
		go c.run()
	})

	return nil
}

func (c *Client) Close() {
	c.cancel()
	c.closeCurrentConnection("client shutting down")

	if !c.started.Load() {
		return
	}

	<-c.done
}

func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *Client) SetEventHandler(fn EventCallback) {
	c.onEvent = fn
}

func (c *Client) WaitUntilConnected(timeout time.Duration) bool {
	if c.IsConnected() {
		return true
	}

	if timeout <= 0 {
		return false
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		if c.IsConnected() {
			return true
		}

		select {
		case <-c.ctx.Done():
			return false
		case <-timer.C:
			return c.IsConnected()
		case <-ticker.C:
		}
	}
}

func (c *Client) Emit(event string, payload interface{}) error {
	c.mu.Lock()
	conn := c.conn
	connected := c.connected
	c.mu.Unlock()

	if conn == nil || !connected {
		return fmt.Errorf("not connected")
	}

	msg := EncodeSIOEvent(event, payload)
	ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
	defer cancel()

	return c.writeText(ctx, conn, msg)
}

func (c *Client) run() {
	defer c.doneOnce.Do(func() {
		close(c.done)
	})

	delay := c.reconnectInterval
	if delay <= 0 {
		delay = 5 * time.Second
	}

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		reason, err := c.connectAndServe()
		if c.ctx.Err() != nil {
			return
		}

		if err != nil {
			c.logger.Printf("relay: connection failed: %v", err)
		} else if reason != "" {
			c.logger.Printf("relay: %s", reason)
			delay = c.reconnectInterval
		}

		c.logger.Printf("relay: reconnecting in %v", delay)

		timer := time.NewTimer(delay)
		select {
		case <-c.ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return
		case <-timer.C:
		}

		delay *= 2
		if delay > c.maxReconnectDelay {
			delay = c.maxReconnectDelay
		}
	}
}

func (c *Client) connectAndServe() (string, error) {
	conn, err := c.dial()
	if err != nil {
		return "", err
	}

	disconnected := false
	reason := "relay connection closed"

	defer func() {
		c.clearConnection(conn)
		_ = conn.Close(websocket.StatusNormalClosure, reason)

		if disconnected && c.onDisconnect != nil && c.ctx.Err() == nil {
			c.onDisconnect(reason)
		}
	}()

	if err := c.performHandshake(conn); err != nil {
		reason = "relay handshake failed"
		return reason, err
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	disconnected = true

	if c.onConnect != nil {
		c.onConnect()
	}

	c.logger.Printf("relay: socket.io connected")

	return c.readLoop(conn)
}

func (c *Client) dial() (*websocket.Conn, error) {
	u, err := relayWebSocketURL(c.relayURL)
	if err != nil {
		return nil, err
	}

	u.Path = joinURLPath(u.Path, "/socket/")
	query := u.Query()
	query.Set("EIO", "4")
	query.Set("transport", "websocket")
	u.RawQuery = query.Encode()

	ctx, cancel := context.WithTimeout(c.ctx, 15*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("websocket dial failed: %w", err)
	}

	conn.SetReadLimit(10 * 1024 * 1024)

	return conn, nil
}

func (c *Client) performHandshake(conn *websocket.Conn) error {
	ctx, cancel := context.WithTimeout(c.ctx, 15*time.Second)
	defer cancel()

	if err := c.awaitEngineOpen(ctx, conn); err != nil {
		return err
	}

	auth := map[string]string{
		"type":         "local_server",
		"serverId":     c.serverID,
		"serverSecret": c.serverSecret,
		"serverName":   c.serverName,
	}

	if err := c.writeText(ctx, conn, EncodeSIOConnect(auth)); err != nil {
		return fmt.Errorf("failed to send connect packet: %w", err)
	}

	for {
		raw, err := c.readText(ctx, conn)
		if err != nil {
			return fmt.Errorf("failed waiting for socket.io connect: %w", err)
		}

		if raw == "" {
			continue
		}

		switch raw[0] {
		case eioPing:
			if err := c.writeText(ctx, conn, string(eioPong)); err != nil {
				return fmt.Errorf("failed to send pong during handshake: %w", err)
			}
		case eioOpen:
			continue
		case eioClose:
			return fmt.Errorf("relay closed the connection during handshake")
		case eioMessage:
			if len(raw) < 2 {
				continue
			}

			sioData := raw[1:]
			switch sioData[0] {
			case sioConnect:
				return nil
			case sioConnectError:
				return fmt.Errorf("socket.io connect error: %s", sioErrorString([]byte(sioData[1:])))
			}
		}
	}
}

func (c *Client) awaitEngineOpen(ctx context.Context, conn *websocket.Conn) error {
	for {
		raw, err := c.readText(ctx, conn)
		if err != nil {
			return fmt.Errorf("failed waiting for engine.io open: %w", err)
		}

		if raw == "" {
			continue
		}

		switch raw[0] {
		case eioOpen:
			return nil
		case eioPing:
			if err := c.writeText(ctx, conn, string(eioPong)); err != nil {
				return fmt.Errorf("failed to send pong before handshake: %w", err)
			}
		case eioClose:
			return fmt.Errorf("relay closed the connection before handshake")
		}
	}
}

func (c *Client) readLoop(conn *websocket.Conn) (string, error) {
	for {
		select {
		case <-c.ctx.Done():
			return "relay client shut down", nil
		default:
		}

		raw, err := c.readText(c.ctx, conn)
		if err != nil {
			select {
			case <-c.ctx.Done():
				return "relay client shut down", nil
			default:
			}

			return fmt.Sprintf("relay read failed: %v", err), err
		}

		if raw == "" {
			continue
		}

		switch raw[0] {
		case eioOpen:
			continue

		case eioClose:
			return "relay closed the engine.io connection", nil

		case eioPing:
			ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
			err := c.writeText(ctx, conn, string(eioPong))
			cancel()
			if err != nil {
				return "failed to send relay pong", err
			}

		case eioPong:
			// ok

		case eioMessage:
			if len(raw) < 2 {
				continue
			}
			sioData := raw[1:]
			if len(sioData) == 0 {
				continue
			}

			switch sioData[0] {
			case sioConnect:
				continue

			case sioDisconnect:
				return "relay sent a socket.io disconnect", nil

			case sioConnectError:
				return "relay rejected the socket.io connection", fmt.Errorf("socket.io connect error: %s", sioErrorString([]byte(sioData[1:])))

			case sioEvent:
				event, args, err := DecodeSIOEvent(raw)
				if err != nil {
					c.logger.Printf("relay: failed to decode event: %v", err)
					continue
				}
				if c.onEvent != nil {
					c.onEvent(event, args)
				}
			}

		case eioNoop:
			// ignore

		case eioUpgrade:
			// ignore for now
		}
	}
}

func (c *Client) clearConnection(conn *websocket.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == conn {
		c.conn = nil
	}
	c.connected = false
}

func (c *Client) closeCurrentConnection(reason string) {
	c.mu.Lock()
	conn := c.conn
	c.conn = nil
	c.connected = false
	c.mu.Unlock()

	if conn != nil {
		_ = conn.Close(websocket.StatusNormalClosure, reason)
	}
}

func (c *Client) readText(ctx context.Context, conn *websocket.Conn) (string, error) {
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

func (c *Client) writeText(ctx context.Context, conn *websocket.Conn, message string) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	return conn.Write(ctx, websocket.MessageText, []byte(message))
}

func sioErrorString(raw []byte) string {
	if len(raw) == 0 {
		return "unknown error"
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err == nil {
		if msg, ok := payload["message"].(string); ok && msg != "" {
			return msg
		}
	}

	return string(raw)
}
