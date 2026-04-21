package sdk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	opencode "github.com/sst/opencode-sdk-go"
)

// SessionMessagesResponseLocal mirrors opencode.SessionMessagesResponse but preserves the patch field in summary diffs
type SessionMessagesResponseLocal struct {
	Info  json.RawMessage `json:"info"`
	Parts []opencode.Part `json:"parts"`
}

// httpClient provides minimal HTTP functionality for SDK migration
type httpClient struct {
	baseURL string
	client  *http.Client
}

func newHTTPClient(baseURL string) *httpClient {
	return &httpClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *httpClient) get(ctx context.Context, path string, query url.Values, result interface{}) error {
	u, err := url.Parse(c.baseURL + "/" + path)
	if err != nil {
		return fmt.Errorf("parse URL: %w", err)
	}
	if query != nil {
		u.RawQuery = query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response body: %w", err)
	}

	if err := json.Unmarshal(bodyBytes, result); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// GetSessionMessages fetches session messages via HTTP, preserving patch field in summary diffs
func (c *httpClient) GetSessionMessages(ctx context.Context, sessionID, directory string, limit int) ([]SessionMessagesResponseLocal, error) {
	query := url.Values{}
	query.Set("directory", directory)
	if limit > 0 {
		query.Set("limit", fmt.Sprintf("%d", limit))
	}

	var result []SessionMessagesResponseLocal
	if err := c.get(ctx, "session/"+sessionID+"/message", query, &result); err != nil {
		return nil, err
	}
	return result, nil
}
