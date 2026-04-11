package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	if httpErr, ok := err.(*echo.HTTPError); ok {
		_ = c.JSON(httpErr.Code, map[string]any{
			"success":   false,
			"message":   httpErr.Message,
			"errorCode": httpErr.Code,
			"details":   httpErr.Message,
		})
		return
	}

	_ = c.JSON(http.StatusInternalServerError, map[string]any{
		"success":   false,
		"message":   "Internal Server Error",
		"errorCode": http.StatusInternalServerError,
		"details":   err.Error(),
	})
}
