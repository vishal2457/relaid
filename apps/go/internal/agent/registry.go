package agent

import (
	"context"
	"fmt"
)

type Registry struct {
	providers map[ProviderID]AgentProvider
}

func NewRegistry(providers ...AgentProvider) *Registry {
	registry := &Registry{
		providers: make(map[ProviderID]AgentProvider, len(providers)),
	}

	for _, provider := range providers {
		registry.providers[provider.ID()] = provider
	}

	return registry
}

func (r *Registry) Get(id ProviderID) (AgentProvider, error) {
	provider, ok := r.providers[id]
	if !ok {
		return nil, fmt.Errorf("provider %q not registered", id)
	}
	return provider, nil
}

func (r *Registry) Shutdown(ctx context.Context) error {
	var firstErr error
	for _, provider := range r.providers {
		if err := provider.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
