package db

import (
	"backend/internal/config"
	"backend/internal/gen/dbstore"
	"context"
	"database/sql"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
)

var pool *pgxpool.Pool

func Init() {
	dbURL := config.GetEnv("GOOSE_DBSTRING", "postgres://postgres:@localhost:5434/derived?sslmode=disable")
	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to parse database config: %v\n", err)
		os.Exit(1)
	}

	pool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool: %v\n", err)
		os.Exit(1)
	}

	if err := pool.Ping(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to ping database: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Database Connection pool initialized successfully")
}

func GetDBQuery() *dbstore.Queries {
	return dbstore.New(pool)
}

func BeginTx(ctx context.Context) (pgx.Tx, error) {
	return pool.Begin(ctx)
}

// GetStdlibDB returns a standard *sql.DB connection pool, needed for goose.
// Important: The caller is responsible for closing this DB handle when done.
func GetStdlibDB() (*sql.DB, error) {
	if pool == nil {
		return nil, fmt.Errorf("database pool not initialized")
	}
	// OpenDBFromPool creates a standard sql.DB wrapper around the pgxpool
	stdlibDB := stdlib.OpenDBFromPool(pool)

	// Verify the connection
	if err := stdlibDB.Ping(); err != nil {
		return nil, fmt.Errorf("unable to ping database via stdlib: %w", err)
	}
	return stdlibDB, nil
}

func CloseDB() {
	if pool != nil {
		pool.Close()
		fmt.Println("Database connection pool closed.")
	}
}
