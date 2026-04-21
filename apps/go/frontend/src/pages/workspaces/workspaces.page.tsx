import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../shared/components/ui/button";
import { ROUTES_PATH } from "../../routes/routes";

type Workspace = {
  id: string;
  name: string;
  description?: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
};

const getApp = () => {
  const app = (window as any).go?.main?.App;
  if (!app) {
    throw new Error("Wails App not initialized");
  }
  return app;
};

export const WorkspacesPage = () => {
  const queryClient = useQueryClient();

  const workspaceQuery = useQuery<Workspace[]>({
    queryKey: ["desktop-workspaces"],
    queryFn: async () => {
      const app = getApp();
      return (await app.ListWorkspaces()) ?? [];
    },
  });

  const createWorkspace = useMutation({
    mutationFn: async () => {
      const app = getApp();
      const directory = await app.SelectWorkspaceDirectory();
      if (!directory) {
        return null;
      }
      return await app.CreateWorkspace(directory);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["desktop-workspaces"] });
    },
  });

  const workspaces = workspaceQuery.data ?? [];

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={ROUTES_PATH.Home}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">Workspaces</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Local folders managed by the desktop app and synced to OpenCode when available.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => workspaceQuery.refetch()}
            disabled={workspaceQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => createWorkspace.mutate()} disabled={createWorkspace.isPending}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Workspace
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-col">
        <div className="rounded-xl border bg-card/40 p-1">
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
            <div className="space-y-2 p-1">
        {workspaces.length === 0 && !workspaceQuery.isLoading ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No workspaces yet. Add a local folder to start managing it here.
          </div>
        ) : null}

        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className="rounded-xl border bg-card/60 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <h2 className="truncate text-base font-medium">{workspace.name}</h2>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {workspace.directory}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Updated {new Date(workspace.updatedAt).toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
