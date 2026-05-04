package agent

import (
	"context"
	"fmt"
	"sort"
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

func (r *Registry) List() []AgentProvider {
	ids := make([]string, 0, len(r.providers))
	for id := range r.providers {
		ids = append(ids, string(id))
	}
	sort.Strings(ids)

	providers := make([]AgentProvider, 0, len(ids))
	for _, id := range ids {
		providers = append(providers, r.providers[ProviderID(id)])
	}
	return providers
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
