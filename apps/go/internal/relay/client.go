package relay

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"

	"context"
)

type EventCallback func(event string, args []json.RawMessage)

type Client struct {
	relayURL     string
	serverID     string
	serverSecret string
	serverName   string

	conn      *websocket.Conn
	mu        sync.Mutex
	connected bool

	onEvent      EventCallback
	onConnect    func()
	onDisconnect func(reason string)

	ctx    context.Context
	cancel context.CancelFunc

	reconnectInterval time.Duration
	logger            *log.Logger

	done chan struct{}
}

type ClientOptions struct {
	RelayURL          string
	ServerID          string
	ServerSecret      string
	ServerName        string
	ReconnectInterval time.Duration
	Logger            *log.Logger
	OnEvent           EventCallback
	OnConnect         func()
	OnDisconnect      func(reason string)
}

func NewClient(opts ClientOptions) *Client {
	if opts.ReconnectInterval == 0 {
		opts.ReconnectInterval = 5 * time.Second
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
	return c.dial()
}

func (c *Client) Close() {
	c.cancel()
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		c.conn.Close(websocket.StatusNormalClosure, "client shutting down")
		c.conn = nil
		c.connected = false
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

func (c *Client) Emit(event string, payload interface{}) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return fmt.Errorf("not connected")
	}

	msg := EncodeSIOEvent(event, payload)
	ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
	defer cancel()

	return conn.Write(ctx, websocket.MessageText, []byte(msg))
}

func (c *Client) dial() error {
	u, err := url.Parse(c.relayURL)
	if err != nil {
		return fmt.Errorf("invalid relay URL: %w", err)
	}

	sid, err := c.engineIOHandshake(u)
	if err != nil {
		return fmt.Errorf("engine.io handshake failed: %w", err)
	}

	wsURL := c.buildWebSocketURL(u, sid)

	ctx, cancel := context.WithTimeout(c.ctx, 15*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("websocket dial failed: %w", err)
	}

	conn.SetReadLimit(10 * 1024 * 1024)

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	go c.readLoop(conn)

	time.Sleep(200 * time.Millisecond)

	auth := map[string]string{
		"type":         "local_server",
		"serverId":     c.serverID,
		"serverSecret": c.serverSecret,
		"serverName":   c.serverName,
	}

	if err := conn.Write(c.ctx, websocket.MessageText, []byte(EncodeSIOConnect(auth))); err != nil {
		c.logger.Printf("relay: failed to send connect packet: %v", err)
		c.handleDisconnect("connect auth failed")
		return err
	}

	return nil
}

func (c *Client) engineIOHandshake(u *url.URL) (string, error) {
	handshakeURL := fmt.Sprintf("%s://%s/socket/?EIO=4&transport=polling", u.Scheme, u.Host)
	if u.Scheme == "wss" {
		handshakeURL = fmt.Sprintf("https://%s/socket/?EIO=4&transport=polling", u.Host)
	} else {
		handshakeURL = fmt.Sprintf("http://%s/socket/?EIO=4&transport=polling", u.Host)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(handshakeURL)
	if err != nil {
		return "", fmt.Errorf("handshake request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("handshake returned status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read handshake body: %w", err)
	}

	if len(body) == 0 || body[0] != '0' {
		return "", fmt.Errorf("invalid handshake response: expected open packet")
	}

	var handshakeData struct {
		SID string `json:"sid"`
	}
	if err := json.Unmarshal(body[1:], &handshakeData); err != nil {
		return "", fmt.Errorf("failed to parse handshake data: %w", err)
	}

	return handshakeData.SID, nil
}

func (c *Client) buildWebSocketURL(u *url.URL, sid string) string {
	scheme := "ws"
	if u.Scheme == "wss" || u.Scheme == "https" {
		scheme = "wss"
	}

	host := u.Host
	result := fmt.Sprintf("%s://%s/socket/?EIO=4&transport=websocket&sid=%s", scheme, host, sid)
	return result
}

func (c *Client) readLoop(conn *websocket.Conn) {
	defer func() {
		c.handleDisconnect("read loop ended")
	}()

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		msgType, data, err := conn.Read(c.ctx)
		if err != nil {
			select {
			case <-c.ctx.Done():
				return
			default:
				c.logger.Printf("relay: read error: %v", err)
				return
			}
		}

		if msgType != websocket.MessageText {
			continue
		}

		raw := string(data)
		if len(raw) == 0 {
			continue
		}

		switch raw[0] {
		case eioOpen:
			c.logger.Printf("relay: received engine.io open")

		case eioClose:
			c.logger.Printf("relay: received engine.io close")
			return

		case eioPing:
			if err := conn.Write(c.ctx, websocket.MessageText, []byte("3")); err != nil {
				c.logger.Printf("relay: failed to send pong: %v", err)
				return
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
				c.logger.Printf("relay: socket.io connected")
				if c.onConnect != nil {
					c.onConnect()
				}

			case sioDisconnect:
				c.logger.Printf("relay: socket.io disconnected")
				return

			case sioConnectError:
				var errData map[string]interface{}
				if len(sioData) > 1 {
					json.Unmarshal([]byte(sioData[1:]), &errData)
				}
				c.logger.Printf("relay: socket.io connect error: %v", errData)
				return

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

func (c *Client) handleDisconnect(reason string) {
	c.mu.Lock()
	wasConnected := c.connected
	c.connected = false

	if c.conn != nil {
		c.conn.Close(websocket.StatusNormalClosure, reason)
		c.conn = nil
	}
	c.mu.Unlock()

	if wasConnected && c.onDisconnect != nil {
		c.onDisconnect(reason)
	}

	select {
	case <-c.ctx.Done():
		close(c.done)
		return
	default:
	}

	c.logger.Printf("relay: scheduling reconnect in %v", c.reconnectInterval)
	time.AfterFunc(c.reconnectInterval, func() {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		c.logger.Printf("relay: attempting reconnect...")
		if err := c.dial(); err != nil {
			c.logger.Printf("relay: reconnect failed: %v", err)
		}
	})
}

func NormalizeRelayURL(rawURL string) string {
	rawURL = strings.TrimRight(rawURL, "/")

	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}

	u.Scheme = strings.Replace(u.Scheme, "http", "ws", 1)
	if u.Scheme == "" {
		u.Scheme = "ws"
	}

	return u.String()
}

func ReadJSON(c *websocket.Conn, ctx context.Context, v interface{}) error {
	return wsjson.Read(ctx, c, v)
}

func WriteJSON(c *websocket.Conn, ctx context.Context, v interface{}) error {
	return wsjson.Write(ctx, c, v)
}
