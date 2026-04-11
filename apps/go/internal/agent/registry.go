package agent

import "fmt"

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
