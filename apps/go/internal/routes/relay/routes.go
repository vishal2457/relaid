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
		url = relay.DefaultRelayURL
	}
	url = relay.NormalizeRelayURL(url)
	if url == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"result":  relay.NormalizeRelayURL(relay.DefaultRelayURL),
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

	normalizedURL := relay.NormalizeRelayURL(req.URL)
	if normalizedURL == "" {
		normalizedURL = relay.NormalizeRelayURL(relay.DefaultRelayURL)
	}

	if err := relay.PingRelayHealth(normalizedURL); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "relay server is not reachable",
		})
	}

	if normalizedURL == relay.NormalizeRelayURL(relay.DefaultRelayURL) {
		if err := r.keychain.Delete("relay_server_url"); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"success": false,
				"error":   "failed to clear URL",
			})
		}
	} else {
		if err := r.keychain.Set("relay_server_url", normalizedURL); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"success": false,
				"error":   "failed to store URL",
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"success": true,
	})
}

func (r *RelayServer) ping(c echo.Context) error {
	url, err := r.keychain.Get("relay_server_url")
	if err != nil || relay.NormalizeRelayURL(url) == "" {
		url = relay.DefaultRelayURL
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
	if err != nil || relay.NormalizeRelayURL(url) == "" {
		url = relay.DefaultRelayURL
	}

	creds, err := relay.LoadOrCreateDeviceCredentials("", "")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   "failed to load device credentials",
		})
	}

	keys, keyErr := relay.LoadOrCreateE2EEKeyMaterial()
	if keyErr != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{
			"success": false,
			"error":   "failed to load e2ee keys",
		})
	}

	session, err := relay.CreatePairingSession(url, creds, keys)
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
