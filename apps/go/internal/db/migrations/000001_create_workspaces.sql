CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    directory TEXT NOT NULL UNIQUE,
    description TEXT,
    opencode_project_id TEXT UNIQUE,
    codex_workspace_id TEXT,
    claude_workspace_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_directory ON workspaces(directory);
CREATE INDEX IF NOT EXISTS idx_workspaces_opencode_project_id ON workspaces(opencode_project_id);
