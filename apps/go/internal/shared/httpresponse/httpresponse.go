package httpresponse

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

type Response struct {
	Success bool   `json:"success"`
	Result  any    `json:"result,omitempty"`
	Message string `json:"message"`
}

func JSON(c echo.Context, status int, success bool, result any, message string) error {
	return c.JSON(status, Response{
		Success: success,
		Result:  result,
		Message: message,
	})
}

func Success(c echo.Context, result any, message string) error {
	return JSON(c, http.StatusOK, true, result, message)
}
