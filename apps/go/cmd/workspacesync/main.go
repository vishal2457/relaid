package main

import (
	"context"
	"log"

	"relaid/internal/config"
	"relaid/internal/db"
	opencodeprovider "relaid/internal/providers/opencode"
	"relaid/internal/workspace"
)

func main() {
	ctx := context.Background()
	cfg := config.Load()

	database, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("close database: %v", err)
		}
	}()

	if err := database.Migrate(ctx); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	provider := opencodeprovider.New(cfg, log.Default())
	defer func() {
		if err := provider.Shutdown(ctx); err != nil {
			log.Printf("shutdown provider: %v", err)
		}
	}()

	service := workspace.NewService(database.Queries())
	if err := service.SyncOpencodeProjects(ctx, provider); err != nil {
		log.Printf("sync via provider failed: %v", err)
		if err := service.SyncOpencodeDatabase(ctx, cfg.OpencodeDBPath); err != nil {
			log.Fatalf("sync workspaces: %v", err)
		}
	}

	items, err := service.List(ctx)
	if err != nil {
		log.Fatalf("list workspaces: %v", err)
	}

	log.Printf("workspace sync complete: db=%s count=%d", database.Path(), len(items))
	for _, item := range items {
		log.Printf("workspace: name=%q directory=%q opencode_project_id=%q", item.Name, item.Directory, item.OpencodeProjectID)
	}
}
