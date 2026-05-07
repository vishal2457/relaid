package secrets

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/google/uuid"
)

const baseServiceName = "relaid"

type Keychain struct{}

func New() *Keychain {
	return &Keychain{}
}

func (k *Keychain) Set(key, value string) error {
	value = strings.TrimSpace(value)

	delCmd := exec.Command("security", "delete-generic-password", "-a", key, "-s", serviceName())
	delCmd.Run()

	cmd := exec.Command("security", "add-generic-password", "-a", key, "-s", serviceName(), "-w", value)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to set keychain value: %v", err)
	}
	return nil
}

func (k *Keychain) Get(key string) (string, error) {
	cmd := exec.Command("security", "find-generic-password", "-a", key, "-s", serviceName(), "-w")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("key not found: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

func (k *Keychain) Delete(key string) error {
	cmd := exec.Command("security", "delete-generic-password", "-a", key, "-s", serviceName())
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if strings.Contains(message, "could not be found") {
			return nil
		}
		return fmt.Errorf("failed to delete keychain value: %v", err)
	}
	return nil
}

func serviceName() string {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("RELAID_ENV")))
	switch env {
	case "", "prod", "production":
		return baseServiceName
	default:
		return fmt.Sprintf("%s.%s", baseServiceName, env)
	}
}

func GenerateServerID() string {
	return uuid.New().String()
}

func GenerateServerSecret() string {
	return uuid.New().String()
}
