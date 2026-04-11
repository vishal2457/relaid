package relay

import (
	"net/http"

	"relaid/internal/relay"
	"relaid/internal/secrets"

	"github.com/labstack/echo/v4"
)

type RelayServer struct {
	keychain *secrets.Keychain
}

func Register(group *echo.Group) {
	r := &RelayServer{
		keychain: secrets.New(),
	}
	group.GET("/stored-url", r.getStoredURL)
	group.POST("/store-url", r.storeURL)
	group.GET("/ping", r.ping)
	group.POST("/pairing-session", r.createPairingSession)
	group.GET("/device-credentials", r.getDeviceCredentials)
}

func (r *RelayServer) getStoredURL(c echo.Context) error {
	url, err := r.keychain.Get("relay_server_url")
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"result":  "",
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
		"result":  url,
	})
}

func (r *RelayServer) storeURL(c echo.Context) error {
	var req struct {
		URL string `json:"url"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "invalid request body",
		})
	}

	if err := relay.PingRelayHealth(req.URL); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "relay server is not reachable",
		})
	}

	if err := r.keychain.Set("relay_server_url", req.URL); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   "failed to store URL",
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
	})
}

func (r *RelayServer) ping(c echo.Context) error {
	url, err := r.keychain.Get("relay_server_url")
	if err != nil || url == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"result": map[string]any{
				"connected": false,
			},
		})
	}

	if err := relay.PingRelayHealth(url); err != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"result": map[string]any{
				"connected": false,
			},
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
		"result": map[string]any{
			"connected": true,
		},
	})
}

func (r *RelayServer) createPairingSession(c echo.Context) error {
	url, err := r.keychain.Get("relay_server_url")
	if err != nil || url == "" {
		return c.JSON(http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "relay URL not configured",
		})
	}

	creds, err := relay.LoadOrCreateDeviceCredentials("", "")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   "failed to load device credentials",
		})
	}

	session, err := relay.CreatePairingSession(url, creds)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
		"result":  session,
	})
}

func (r *RelayServer) getDeviceCredentials(c echo.Context) error {
	creds, err := relay.LoadOrCreateDeviceCredentials("", "")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   "failed to load device credentials",
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
		"result":  creds,
	})
}
