-- name: CreateWorkspace :one
INSERT INTO workspace (
    name,
    description,
    directory
) VALUES (
    $1, $2, $3
) RETURNING *;