package relay

import (
	"fmt"
	"net/url"
	"strings"
)

func NormalizeRelayURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}

	if !strings.Contains(rawURL, "://") {
		rawURL = "http://" + rawURL
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return strings.TrimRight(rawURL, "/")
	}

	u.Path = strings.TrimRight(u.Path, "/")
	u.RawQuery = ""
	u.Fragment = ""

	if u.Scheme == "" {
		u.Scheme = "http"
	}

	return strings.TrimRight(u.String(), "/")
}

func relayHTTPURL(rawURL string) (*url.URL, error) {
	u, err := parseRelayURL(rawURL)
	if err != nil {
		return nil, err
	}

	switch u.Scheme {
	case "http", "https":
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	default:
		return nil, fmt.Errorf("unsupported relay scheme %q", u.Scheme)
	}

	return u, nil
}

func relayWebSocketURL(rawURL string) (*url.URL, error) {
	u, err := parseRelayURL(rawURL)
	if err != nil {
		return nil, err
	}

	switch u.Scheme {
	case "ws", "wss":
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	default:
		return nil, fmt.Errorf("unsupported relay scheme %q", u.Scheme)
	}

	return u, nil
}

func buildRelayEndpointURL(rawURL string, endpointPath string) (string, error) {
	u, err := relayHTTPURL(rawURL)
	if err != nil {
		return "", err
	}

	u.Path = joinURLPath(u.Path, endpointPath)
	u.RawQuery = ""
	u.Fragment = ""

	return u.String(), nil
}

func joinURLPath(basePath string, appendPath string) string {
	basePath = strings.TrimRight(basePath, "/")
	appendPath = "/" + strings.TrimLeft(appendPath, "/")

	if basePath == "" {
		return appendPath
	}

	return basePath + appendPath
}

func parseRelayURL(rawURL string) (*url.URL, error) {
	normalized := NormalizeRelayURL(rawURL)
	if normalized == "" {
		return nil, fmt.Errorf("relay URL is empty")
	}

	u, err := url.Parse(normalized)
	if err != nil {
		return nil, fmt.Errorf("invalid relay URL: %w", err)
	}

	if u.Host == "" {
		return nil, fmt.Errorf("relay URL is missing host")
	}

	return u, nil
}
