-- name: ListWorkspaces :many
SELECT
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at
FROM workspaces
ORDER BY name ASC, directory ASC;

-- name: GetWorkspaceByDirectory :one
SELECT
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at
FROM workspaces
WHERE directory = ?
LIMIT 1;

-- name: GetWorkspaceByOpencodeProjectID :one
SELECT
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at
FROM workspaces
WHERE opencode_project_id = ?
LIMIT 1;

-- name: CreateWorkspace :one
INSERT INTO workspaces (
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at
) VALUES (
    sqlc.arg(name),
    sqlc.arg(directory),
    sqlc.narg(description),
    sqlc.narg(opencode_project_id),
    sqlc.narg(codex_workspace_id),
    sqlc.narg(claude_workspace_id),
    sqlc.arg(created_at),
    sqlc.arg(updated_at)
)
RETURNING
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at;

-- name: UpdateWorkspace :one
UPDATE workspaces
SET
    name = sqlc.arg(name),
    description = sqlc.narg(description),
    opencode_project_id = sqlc.narg(opencode_project_id),
    codex_workspace_id = sqlc.narg(codex_workspace_id),
    claude_workspace_id = sqlc.narg(claude_workspace_id),
    updated_at = sqlc.arg(updated_at)
WHERE directory = sqlc.arg(directory)
RETURNING
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at;

-- name: UpsertWorkspaceFromSync :one
INSERT INTO workspaces (
    name,
    directory,
    description,
    opencode_project_id,
    created_at,
    updated_at
) VALUES (
    sqlc.arg(name),
    sqlc.arg(directory),
    sqlc.narg(description),
    sqlc.narg(opencode_project_id),
    sqlc.arg(created_at),
    sqlc.arg(updated_at)
)
ON CONFLICT(directory) DO UPDATE SET
    name = excluded.name,
    description = COALESCE(excluded.description, workspaces.description),
    opencode_project_id = COALESCE(excluded.opencode_project_id, workspaces.opencode_project_id),
    updated_at = excluded.updated_at
RETURNING
    id,
    name,
    directory,
    description,
    opencode_project_id,
    codex_workspace_id,
    claude_workspace_id,
    created_at,
    updated_at;
