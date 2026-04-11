package health

import (
	"time"

	"relaid/internal/shared/httpresponse"

	"github.com/labstack/echo/v4"
)

type StatusProvider interface {
	Healthy() bool
	Issues() []string
	Address() string
}

func Register(api *echo.Group, provider StatusProvider) {
	api.GET("/check", func(c echo.Context) error {
		payload := map[string]any{
			"status":    "ok",
			"server":    provider.Address(),
			"issues":    provider.Issues(),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		}

		if provider.Healthy() {
			return httpresponse.Success(c, payload, "OK")
		}

		payload["status"] = "degraded"
		return httpresponse.Success(c, payload, "Server configuration is incomplete")
	})
}
