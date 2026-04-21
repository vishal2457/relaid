package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"relaid/internal/db/sqlc"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Database struct {
	conn    *sql.DB
	queries *sqlc.Queries
	path    string
}

func Open(path string) (*Database, error) {
	if path == "" {
		return nil, fmt.Errorf("database path is required")
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	conn.SetMaxOpenConns(1)

	if _, err := conn.Exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("configure sqlite pragmas: %w", err)
	}

	if err := conn.Ping(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}

	return &Database{
		conn:    conn,
		queries: sqlc.New(conn),
		path:    path,
	}, nil
}

func (d *Database) Path() string {
	return d.path
}

func (d *Database) Conn() *sql.DB {
	return d.conn
}

func (d *Database) Queries() *sqlc.Queries {
	return d.queries
}

func (d *Database) Close() error {
	if d == nil || d.conn == nil {
		return nil
	}
	return d.conn.Close()
}

func (d *Database) Migrate(ctx context.Context) error {
	if _, err := d.conn.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY NOT NULL,
			applied_at INTEGER NOT NULL
		)
	`); err != nil {
		return fmt.Errorf("ensure schema_migrations table: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		var exists int
		err := d.conn.QueryRowContext(ctx, `SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1`, entry.Name()).Scan(&exists)
		if err == nil {
			continue
		}
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("check migration %s: %w", entry.Name(), err)
		}

		script, err := migrationsFS.ReadFile(filepath.ToSlash(filepath.Join("migrations", entry.Name())))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}

		tx, err := d.conn.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", entry.Name(), err)
		}

		if _, err := tx.ExecContext(ctx, string(script)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}

		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, unixepoch() * 1000)`, entry.Name()); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", entry.Name(), err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", entry.Name(), err)
		}
	}

	return nil
}
