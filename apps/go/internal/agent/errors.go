package agent

import "fmt"

type UnsupportedCapabilityError struct {
	Provider   ProviderID
	Capability string
}

func (e *UnsupportedCapabilityError) Error() string {
	return fmt.Sprintf("%s does not support %s", e.Provider, e.Capability)
}

func NewUnsupportedCapability(provider ProviderID, capability string) error {
	return &UnsupportedCapabilityError{
		Provider:   provider,
		Capability: capability,
	}
}
