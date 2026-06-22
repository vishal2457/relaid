import React, { useEffect, useRef, useState } from "react";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { Ticket, AgentRun, AgentStreamEvent, Goal, Project } from "../types";
import {
  Bot,
  LayoutGrid,
  Plus,
  FolderOpen,
  Target,
  Cpu,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  PanelRight,
  Clock,
  FileCode,
  History,
  Monitor,
  Wrench,
  CheckCircle2,
  XCircle as XCircleIcon,
  Loader2,
  Settings,
  TerminalSquare,
  ChevronDown,
  ChevronRight,
  ListTree,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-red-500/50 text-red-500",
  high: "border-orange-500/50 text-orange-500",
  medium: "border-blue-500/50 text-blue-500",
  low: "border-muted-foreground/30 text-muted-foreground",
};

const HARNESS_COLORS: Record<string, string> = {
  claude: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  codex: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  opencode: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  gemini: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

function groupByStatus(tickets: Ticket[], statuses: string[]): Ticket[] {
  return tickets.filter((t) => statuses.includes(t.status));
}

function KanbanColumn({
  title,
  tickets,
  agentRuns,
  statuses,
  onTicketClick,
}: {
  title: string;
  tickets: Ticket[];
  agentRuns: AgentRun[];
  statuses: string[];
  onTicketClick?: (ticket: Ticket) => void;
}) {
  const columnTickets = groupByStatus(tickets, statuses);

  return (
    <div className="flex flex-col flex-1 gap-3 min-w-[230px] bg-muted/30 p-3 rounded-lg border">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {columnTickets.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 -mx-3 px-3">
        <div className="flex flex-col gap-3">
          {columnTickets.map((ticket) => (
            <Card
              key={ticket.id}
              onClick={() => onTicketClick?.(ticket)}
              className="p-3 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm leading-tight line-clamp-2">
                  {ticket.title}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[ticket.priority] || ""}`}
                >
                  {ticket.priority}
                </Badge>
              </div>

              {ticket.type && (
                <Badge variant="secondary" className="text-[10px] w-fit">
                  {ticket.type}
                </Badge>
              )}
              {ticket.status === "blocked" && (
                <Badge variant="outline" className="text-[10px] w-fit border-amber-500/50 text-amber-600">
                  Blocked by {ticket.blockingTicketIds.join(", ") || "dependency"}
                </Badge>
              )}

              {ticket.relevantFiles.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileCode className="w-3 h-3" />
                    Files
                  </span>
                  {ticket.relevantFiles.slice(0, 2).map((file) => (
                    <code
                      key={file}
                      className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono truncate"
                    >
                      {file}
                    </code>
                  ))}
                  {ticket.relevantFiles.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{ticket.relevantFiles.length - 2} more
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {ticket.id}
                </span>
                {ticket.assignedAgentId ? (
                  <Avatar className="h-5 w-5 border">
                    <AvatarFallback className="text-[9px]">
                      {agentRuns
                        .find((r) => r.ticketId === ticket.id)
                        ?.provider.charAt(0)
                        .toUpperCase() || "A"}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-5 w-5 rounded-full border border-dashed flex items-center justify-center bg-muted/50">
                    <span className="text-[9px] text-muted-foreground">-</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {columnTickets.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground italic bg-background/50 rounded-md border border-dashed">
              Empty
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HarnessCard({ id, label, available, version, models, modelSource }: { id: string; name: string; label: string; available: boolean; version?: string; models: string[]; modelSource: string; modelError?: string }) {
  const colors = HARNESS_COLORS[id] || "bg-muted text-muted-foreground border-muted";
  return (
    <details className={`group rounded-lg border ${colors}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-2.5 [&::-webkit-details-marker]:hidden">
        <Wrench className="h-4 w-4 shrink-0" />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium leading-none">{label}</span>
          <span className="text-[10px] opacity-70 mt-0.5">
            {available && version ? `v${version}` : available ? "available" : "not detected"} · {models.length} models ({modelSource})
          </span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${available ? "border-green-500/50 text-green-500" : "border-red-500/50 text-red-500"}`}>
          {available ? "Ready" : "Offline"}
        </Badge>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-current/10 px-2.5 py-2">
        <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
          {models.map((model) => <code key={model} className="block truncate rounded bg-background/60 px-2 py-1 text-[10px]">{model}</code>)}
          {models.length === 0 && <span className="text-[10px] opacity-70">No models reported</span>}
        </div>
      </div>
    </details>
  );
}

function AgentRunCard({ run, ticket, agentName }: { run: AgentRun; ticket?: Ticket; agentName?: string }) {
  const statusIcon =
    run.status === "running" || run.status === "starting" ? (
      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
    ) : run.status === "completed" ? (
      <CheckCircle2 className="h-3 w-3 text-green-500" />
    ) : run.status === "failed" ? (
      <XCircleIcon className="h-3 w-3 text-red-500" />
    ) : (
      <Clock className="h-3 w-3 text-muted-foreground" />
    );

  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium">
            {agentName || ticket?.title || run.ticketId}
          </span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${HARNESS_COLORS[run.provider] || ""}`}>
          {run.provider}
        </Badge>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {agentName && ticket && <span className="truncate">{ticket.title}</span>}
        <span className="font-mono">{run.id}</span>
        <span className="capitalize">{run.status}</span>
        <span>{run.model}</span>
      </div>
    </div>
  );
}

function streamEventText(event: AgentStreamEvent): string {
  if (event.type === "text_delta" || event.type === "reasoning_delta" || event.type === "status") {
    return String(event.data.content || "");
  }
  if (event.type === "tool_use") {
    const input = event.data.toolInput ? ` ${JSON.stringify(event.data.toolInput)}` : "";
    return `Running ${event.data.toolName || "tool"}${input}`;
  }
  if (event.type === "tool_result") return String(event.data.content || "Tool completed");
  if (event.type === "error") return String(event.data.message || event.data.error || "Agent error");
  if (event.type === "turn_complete") {
    return event.data.success ? "Turn completed" : String(event.data.error || "Turn failed");
  }
  if (event.type === "permission_request") return `Permission requested: ${event.data.toolName || "tool"}`;
  return event.type;
}

function AgentStreamPanel({ events, active }: { events: AgentStreamEvent[]; active: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [events]);

  return (
    <div ref={viewportRef} className="h-[360px] overflow-y-auto rounded-lg border bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
      {events.map((event, index) => {
        const isError = event.type === "error" || event.data.isError === true;
        const isActivity = event.type === "tool_use" || event.type === "tool_result" || event.type === "status";
        return (
          <div key={`${event.receivedAt}-${index}`} className={`mb-2 whitespace-pre-wrap break-words ${isError ? "text-red-400" : isActivity ? "text-cyan-300" : event.type === "reasoning_delta" ? "text-zinc-400" : ""}`}>
            <span className="mr-2 select-none text-[10px] uppercase text-zinc-600">{event.type.replace("_delta", "")}</span>
            {streamEventText(event)}
          </div>
        );
      })}
      {events.length === 0 && <div className="text-zinc-500">{active ? "Waiting for agent output…" : "No live output was captured for this run."}</div>}
      {active && <span className="inline-block h-3 w-1.5 animate-pulse bg-zinc-400 align-middle" />}
    </div>
  );
}

export function Dashboard() {
  const {
    projects,
    goals,
    tickets,
    agentRuns,
    agentStreams,
    harnesses,
    agents,
    orchestrator,
    loading,
    error,
    selectedProjectId,
    setSelectedProjectId,
    selectedGoalId,
    setSelectedGoalId,
    addProject,
    addGoal,
    addAgent,
    updateOrchestrator,
    executeGoal,
    pauseGoal,
    resumeGoal,
    cancelGoal,
  } = useRealtimeDashboard();

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLocation, setNewProjectLocation] = useState("");
  const [newProjectExecutionMode, setNewProjectExecutionMode] = useState<"direct" | "worktree">("direct");
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentProvider, setNewAgentProvider] = useState<"claude" | "codex" | "opencode">("codex");
  const [newAgentModel, setNewAgentModel] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("You are a senior software engineer. Work only on assigned tickets, use strict TDD, and verify every change.");
  const [isOrchestratorDialogOpen, setIsOrchestratorDialogOpen] = useState(false);
  const [orchestratorProvider, setOrchestratorProvider] = useState<"claude" | "codex" | "opencode">("codex");
  const [orchestratorModel, setOrchestratorModel] = useState("");
  const [orchestratorPrompt, setOrchestratorPrompt] = useState("");

  const [viewingTicketDetails, setViewingTicketDetails] = useState<Ticket | null>(null);
  const [viewingAgentRun, setViewingAgentRun] = useState<AgentRun | null>(null);
  const [isAgentRunsDialogOpen, setIsAgentRunsDialogOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAgentTrayCollapsed, setIsAgentTrayCollapsed] = useState(false);

  const handleProjectSelect = (pid: string) => {
    setSelectedProjectId(pid);
    const projGoals = goals.filter((g) => g.projectId === pid);
    if (projGoals.length > 0) {
      if (!projGoals.find((g) => g.id === selectedGoalId)) {
        setSelectedGoalId(projGoals[0].id);
      }
    } else {
      setSelectedGoalId("");
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectLocation.trim()) return;
    const p = await addProject(newProjectName, newProjectLocation, newProjectExecutionMode);
    if (p) {
      setSelectedProjectId(p.id);
      setSelectedGoalId("");
    }
    setNewProjectName("");
    setNewProjectLocation("");
    setNewProjectExecutionMode("direct");
    setIsProjectDialogOpen(false);
  };

  const handleCreateGoal = async () => {
    if (!newGoalTitle.trim() || !selectedProjectId) return;
    const g = await addGoal(selectedProjectId, newGoalTitle, newGoalDescription);
    if (g) {
      setSelectedGoalId(g.id);
    }
    setNewGoalTitle("");
    setNewGoalDescription("");
    setIsGoalDialogOpen(false);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !newAgentModel || !newAgentPrompt.trim()) return;
    await addAgent({ name: newAgentName.trim(),
      provider: newAgentProvider, model: newAgentModel, systemPrompt: newAgentPrompt.trim(),
      permissionMode: "bypassPermissions", enabled: true });
    setNewAgentName(""); setIsAgentDialogOpen(false);
  };

  const openOrchestratorEditor = () => {
    if (!orchestrator) return;
    setOrchestratorProvider(orchestrator.provider); setOrchestratorModel(orchestrator.model);
    setOrchestratorPrompt(orchestrator.systemPrompt); setIsOrchestratorDialogOpen(true);
  };
  const handleUpdateOrchestrator = async () => {
    await updateOrchestrator({ provider: orchestratorProvider, model: orchestratorModel, systemPrompt: orchestratorPrompt });
    setIsOrchestratorDialogOpen(false);
  };

  const handleExecuteGoal = async () => {
    if (!selectedGoalId) return;
    await executeGoal(selectedGoalId);
  };

  const handlePauseGoal = async () => {
    if (!selectedGoalId) return;
    await pauseGoal(selectedGoalId);
  };

  const handleResumeGoal = async () => {
    if (!selectedGoalId) return;
    await resumeGoal(selectedGoalId);
  };

  const handleCancelGoal = async () => {
    if (!selectedGoalId) return;
    await cancelGoal(selectedGoalId);
  };

  const currentProjectGoals = goals.filter((g) => g.projectId === selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedGoal = goals.find((g) => g.id === selectedGoalId);
  const displayTickets = selectedGoalId
    ? tickets.filter((t) => t.goalId === selectedGoalId)
    : [];
  const goalAgentRuns = selectedGoalId
    ? agentRuns.filter((r) => r.goalId === selectedGoalId)
    : [];
  const activeAgentRuns = goalAgentRuns.filter((run) => run.status === "starting" || run.status === "running");
  const selectedAgentRun = viewingAgentRun
    ? goalAgentRuns.find((run) => run.id === viewingAgentRun.id) || viewingAgentRun
    : null;
  const projectAgents = agents;
  const selectedHarness = harnesses.find((harness) => harness.id === newAgentProvider);
  const orchestratorHarness = harnesses.find((harness) => harness.id === orchestratorProvider);

  const projectItems = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );
  const goalItems = React.useMemo(
    () => currentProjectGoals.map((g) => ({ value: g.id, label: g.title })),
    [currentProjectGoals],
  );

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Connecting to agent server...</span>
        </div>
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <XCircleIcon className="h-8 w-8 text-red-500" />
          <span className="text-sm text-muted-foreground">{error}</span>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isGoalRunning = selectedGoal?.status === "running";
  const isGoalPaused = selectedGoal?.status === "paused";
  const isGoalCancelled = selectedGoal?.status === "cancelled";
  const canRetryPlanning = selectedGoal?.status === "failed" && selectedGoal.ticketIds.length === 0;
  const canExecute = selectedGoal && (selectedGoal.status === "draft" || selectedGoal.status === "ready" || canRetryPlanning);
  const visibleGoalError = selectedGoal?.lastError ?? (selectedGoal?.status === "failed" ? {
    phase: "execution" as const,
    message: "This failure was recorded before detailed diagnostics were available. Retry planning to capture the underlying error.",
    occurredAt: selectedGoal.updatedAt,
  } : null);

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
      <header className="flex h-16 items-center justify-between border-b px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">
            Agent Workbench
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {error && (
            <span className="text-red-500 text-xs">{error}</span>
          )}
          <span className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full animate-pulse ${error ? "bg-red-500" : "bg-green-500"}`} />
            {error ? "Connection Issue" : "Agent Server Online"}
          </span>
        </div>
      </header>

      {/* Project & Goal Selectors */}
      <div className="flex items-center gap-4 border-b px-6 py-3 bg-muted/10 shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <Label className="text-muted-foreground text-xs">Project:</Label>
          <Select
            value={selectedProjectId || ""}
            onValueChange={handleProjectSelect}
            items={projectItems}
          >
            <SelectTrigger className="w-[180px] h-8 bg-background">
              <SelectValue placeholder="Select Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} label={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsProjectDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {selectedProject && (
          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[280px] border-l pl-4" title={selectedProject.location}>
            {selectedProject.location}
          </span>
        )}

        <div className="flex items-center gap-3">
          <Target className="h-4 w-4 text-muted-foreground" />
          <Label className="text-muted-foreground text-xs">Goal:</Label>
          <Select
            value={selectedGoalId || ""}
            onValueChange={setSelectedGoalId}
            disabled={!selectedProjectId || currentProjectGoals.length === 0}
            items={goalItems}
          >
            <SelectTrigger className="w-[220px] h-8 bg-background">
              <SelectValue placeholder="Select Goal" />
            </SelectTrigger>
            <SelectContent>
              {currentProjectGoals.map((g) => (
                <SelectItem key={g.id} value={g.id} label={g.title}>
                  <span className="flex items-center gap-2">
                    {g.title}
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{g.status}</Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!selectedProjectId}
            onClick={() => setIsGoalDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {selectedGoal && (
          <div className="flex items-center gap-2 ml-auto">
            <Badge
              variant="outline"
              className={`text-[11px] px-2 py-0.5 capitalize ${
                selectedGoal.status === "running"
                  ? "border-green-500/50 text-green-500"
                  : selectedGoal.status === "failed"
                    ? "border-red-500/50 text-red-500"
                    : selectedGoal.status === "completed"
                      ? "border-blue-500/50 text-blue-500"
                      : ""
              }`}
            >
              {selectedGoal.status}
            </Badge>
            {canExecute && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleExecuteGoal}>
                <Play className="h-3 w-3" />
                {canRetryPlanning ? "Retry planning" : "Execute"}
              </Button>
            )}
            {isGoalRunning && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handlePauseGoal}>
                  <Pause className="h-3 w-3" />
                  Pause
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500" onClick={handleCancelGoal}>
                  <XCircle className="h-3 w-3" />
                  Cancel
                </Button>
              </>
            )}
            {isGoalPaused && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleResumeGoal}>
                <RotateCcw className="h-3 w-3" />
                Resume
              </Button>
            )}
            {isGoalCancelled && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleResumeGoal}>
                <RotateCcw className="h-3 w-3" />
                Resume
              </Button>
            )}
          </div>
        )}
      </div>

      {selectedGoal?.status === "planning" && (
        <div className="mx-6 mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-700 shrink-0">
          The orchestrator is inspecting the project and creating the ticket plan.
        </div>
      )}
      {visibleGoalError && (
        <div className="mx-6 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 shrink-0">
          <div className="flex items-start gap-3">
            <XCircleIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="font-semibold text-sm text-red-600 capitalize">{visibleGoalError.phase} failed</span><span className="text-[10px] text-muted-foreground">{new Date(visibleGoalError.occurredAt).toLocaleString()}</span></div>
              <p className="mt-1 text-sm text-red-600 whitespace-pre-wrap">{visibleGoalError.message}</p>
              {"details" in visibleGoalError && visibleGoalError.details && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-red-600">Show diagnostic output</summary><pre className="mt-2 max-h-40 overflow-auto rounded border border-red-500/20 bg-background/70 p-3 text-xs whitespace-pre-wrap text-foreground">{visibleGoalError.details}</pre></details>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden bg-card rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Kanban Board</h2>
                <Badge variant="secondary" className="ml-2">
                  {displayTickets.length} Tickets
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {activeAgentRuns.length > 0 && (
                  <div className="flex items-center rounded-full border bg-muted/30 p-1">
                    {!isAgentTrayCollapsed && (
                      <div className="flex -space-x-2 px-1">
                        {activeAgentRuns.map((run) => {
                          const profile = agents.find((agent) => agent.id === run.agentProfileId) || (run.agentProfileId === orchestrator?.id ? orchestrator : undefined);
                          return (
                            <button key={run.id} type="button" title={`${profile?.name || "Agent"} · ${run.provider}`} className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-ring" onClick={() => setViewingAgentRun(run)}>
                              <Avatar className="h-8 w-8 border-2 border-card">
                                <AvatarFallback className={`text-[10px] font-semibold ${HARNESS_COLORS[run.provider] || ""}`}>
                                  {(profile?.name || run.provider).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" title={isAgentTrayCollapsed ? "Show working agents" : "Collapse working agents"} onClick={() => setIsAgentTrayCollapsed((value) => !value)}>
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isAgentTrayCollapsed ? "rotate-180" : ""}`} />
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                  <PanelRight className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-hidden">
              <div className="flex gap-4 h-full overflow-x-auto pb-2">
                <KanbanColumn
                  title="Ready / Blocked"
                  tickets={displayTickets}
                  agentRuns={goalAgentRuns}
                  statuses={["backlog", "ready", "blocked"]}
                  onTicketClick={setViewingTicketDetails}
                />
                <KanbanColumn
                  title="In Progress"
                  tickets={displayTickets}
                  agentRuns={goalAgentRuns}
                  statuses={["in_progress"]}
                  onTicketClick={setViewingTicketDetails}
                />
                <KanbanColumn
                  title="Review"
                  tickets={displayTickets}
                  agentRuns={goalAgentRuns}
                  statuses={["review"]}
                  onTicketClick={setViewingTicketDetails}
                />
                <KanbanColumn
                  title="Done / Failed"
                  tickets={displayTickets}
                  agentRuns={goalAgentRuns}
                  statuses={["completed", "failed"]}
                  onTicketClick={setViewingTicketDetails}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div
          className={`transition-all duration-300 ease-in-out flex flex-col gap-6 overflow-hidden ${isSidebarOpen ? "w-[320px] opacity-100" : "w-0 opacity-0"}`}
        >
          <div className="w-[320px] flex flex-col gap-4 overflow-hidden h-full">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Harnesses & Agents
              </h2>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setIsAgentRunsDialogOpen(true)}><ListTree className="h-3 w-3" /> Runs</Button>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => {
                  const harness = harnesses.find((item) => item.available) || harnesses[0];
                  if (harness) { setNewAgentProvider(harness.id as "claude" | "codex" | "opencode"); setNewAgentModel(harness.models[0] || ""); }
                  setIsAgentDialogOpen(true);
                }}><Plus className="h-3 w-3" /> Agent</Button>
              </div>
            </div>

            {/* Harnesses */}
            <details className="group flex flex-col rounded-lg border bg-muted/10" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                <Monitor className="h-3.5 w-3.5" />
                Available Harnesses
                <span className="ml-auto">{harnesses.filter((harness) => harness.available).length}/{harnesses.length}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-2 border-t p-2">
                {harnesses.map((h) => <HarnessCard key={h.id} {...h} />)}
                {harnesses.length === 0 && <span className="text-xs text-muted-foreground italic">No harnesses detected</span>}
              </div>
            </details>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Configured Agents</h3>
              {projectAgents.map((agent) => (
                <div key={agent.id} className="rounded-lg border bg-card p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="text-sm font-medium truncate">{agent.name}</div><div className="text-[10px] text-muted-foreground truncate">{agent.model}</div></div>
                  <Badge variant="outline" className={`text-[10px] ${HARNESS_COLORS[agent.provider] || ""}`}>{agent.provider}</Badge>
                </div>
              ))}
              {projectAgents.length === 0 && <span className="text-xs text-muted-foreground italic">No reusable worker agents configured. The orchestrator can generate them when needed.</span>}
            </div>

            {/* Orchestrator Config */}
            <details className="group mt-2 rounded-lg border bg-muted/10" open>
              <summary className="flex cursor-pointer list-none items-center px-3 py-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"><TerminalSquare className="mr-2 h-3.5 w-3.5" />Orchestrator config<ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
              <div className="flex flex-col gap-2 border-t p-2">
              <div className="flex items-center justify-end"><Button size="sm" variant="ghost" className="h-6 text-xs" onClick={openOrchestratorEditor}>Edit</Button></div>
              {selectedGoal ? (
                <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Manager</span>
                    <span className="text-xs font-medium truncate max-w-[170px]">{orchestrator?.name || "Missing"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Harness / Model</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${HARNESS_COLORS[orchestrator?.provider || ""] || ""}`}>
                      {orchestrator ? `${orchestrator.provider} · ${orchestrator.model}` : "unconfigured"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Max Agents</span>
                    <span className="text-xs font-medium">{selectedGoal.maxAgents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Max Retries</span>
                    <span className="text-xs font-medium">{selectedGoal.maxRetries}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Auto Retry</span>
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${selectedGoal.autoRetry ? "border-green-500/50 text-green-500" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      {selectedGoal.autoRetry ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Auto Merge</span>
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${selectedGoal.autoMerge ? "border-green-500/50 text-green-500" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      {selectedGoal.autoMerge ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Require Review</span>
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${selectedGoal.requireReview ? "border-blue-500/50 text-blue-500" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      {selectedGoal.requireReview ? "On" : "Off"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic py-1">
                  Select a goal to view orchestrator config
                </span>
              )}
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Project Name</Label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Core Platform v2"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Repository Path</Label>
              <Input
                value={newProjectLocation}
                onChange={(e) => setNewProjectLocation(e.target.value)}
                placeholder="e.g. /Users/me/projects/my-repo"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Execution Mode</Label>
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={newProjectExecutionMode} onChange={(event) => setNewProjectExecutionMode(event.target.value as "direct" | "worktree")}>
                <option value="direct">Direct — agents work in this exact path</option>
                <option value="worktree">Worktree — isolated Git branch per ticket</option>
              </select>
              <span className="text-xs text-muted-foreground">Worktree mode requires the path to be a Git repository.</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || !newProjectLocation.trim()}
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Goal Dialog */}
      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Goal to Project</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Goal Title</Label>
              <Input
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="e.g. Refactor Auth Flow"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={newGoalDescription}
                onChange={(e) => setNewGoalDescription(e.target.value)}
                placeholder="Describe what this goal aims to achieve..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateGoal} disabled={!newGoalTitle.trim()}>
              Create Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Create Global Agent</DialogTitle></DialogHeader>
          <div className="py-4 grid gap-4">
            <div className="flex flex-col gap-2"><Label>Name</Label><Input value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="Backend specialist" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2"><Label>Harness</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={newAgentProvider} onChange={(event) => { const provider = event.target.value as "claude" | "codex" | "opencode"; setNewAgentProvider(provider); setNewAgentModel(harnesses.find((item) => item.id === provider)?.models[0] || ""); }}>{harnesses.map((harness) => <option key={harness.id} value={harness.id} disabled={!harness.available}>{harness.label}{harness.available ? "" : " (offline)"}</option>)}</select></div>
              <div className="flex flex-col gap-2"><Label>Model</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={newAgentModel} onChange={(event) => setNewAgentModel(event.target.value)}><option value="">Select model</option>{selectedHarness?.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></div>
            </div>
            <div className="flex flex-col gap-2"><Label>System Prompt</Label><textarea className="min-h-[130px] rounded-md border bg-background px-3 py-2 text-sm" value={newAgentPrompt} onChange={(event) => setNewAgentPrompt(event.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={handleCreateAgent} disabled={!newAgentName.trim() || !newAgentModel || !newAgentPrompt.trim()}>Create Agent</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOrchestratorDialogOpen} onOpenChange={setIsOrchestratorDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Orchestrator</DialogTitle></DialogHeader>
          <div className="py-4 grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2"><Label>Harness</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={orchestratorProvider} onChange={(event) => { const provider = event.target.value as "claude" | "codex" | "opencode"; setOrchestratorProvider(provider); setOrchestratorModel(harnesses.find((item) => item.id === provider)?.models[0] || ""); }}>{harnesses.map((harness) => <option key={harness.id} value={harness.id} disabled={!harness.available}>{harness.label}</option>)}</select></div>
              <div className="flex flex-col gap-2"><Label>Model</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={orchestratorModel} onChange={(event) => setOrchestratorModel(event.target.value)}>{orchestratorHarness?.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></div>
            </div>
            <div className="flex flex-col gap-2"><Label>System Prompt</Label><textarea className="min-h-[180px] rounded-md border bg-background px-3 py-2 text-sm" value={orchestratorPrompt} onChange={(event) => setOrchestratorPrompt(event.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={handleUpdateOrchestrator} disabled={!orchestratorModel || !orchestratorPrompt.trim()}>Save Orchestrator</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Runs List Dialog */}
      <Dialog open={isAgentRunsDialogOpen} onOpenChange={setIsAgentRunsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Agent Runs {goalAgentRuns.length > 0 && `(${goalAgentRuns.length})`}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="min-h-0 h-[55vh]">
            <div className="flex flex-col gap-2 pr-4">
              {goalAgentRuns.map((run) => (
                <button key={run.id} type="button" className="cursor-pointer text-left" onClick={() => { setIsAgentRunsDialogOpen(false); setViewingAgentRun(run); }}>
                  <AgentRunCard run={run} ticket={displayTickets.find((ticket) => ticket.id === run.ticketId)} agentName={agents.find((agent) => agent.id === run.agentProfileId)?.name || (run.agentProfileId === orchestrator?.id ? orchestrator.name : undefined)} />
                </button>
              ))}
              {goalAgentRuns.length === 0 && <span className="py-10 text-center text-xs italic text-muted-foreground">{selectedGoalId ? "No agent runs for this goal" : "Select a goal to see agent runs"}</span>}
            </div>
          </ScrollArea>
          <DialogFooter><Button variant="outline" onClick={() => setIsAgentRunsDialogOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Run Detail Dialog */}
      <Dialog
        open={!!selectedAgentRun}
        onOpenChange={(open) => !open && setViewingAgentRun(null)}
      >
        <DialogContent className="max-w-3xl">
          {selectedAgentRun && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`px-2 py-0.5 text-xs uppercase ${HARNESS_COLORS[selectedAgentRun.provider] || ""}`}
                  >
                    {selectedAgentRun.provider}
                  </Badge>
                  Agent Run
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Run ID</Label>
                    <p className="text-sm font-mono">{selectedAgentRun.id}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <p className="text-sm font-medium capitalize">{selectedAgentRun.status}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ticket</Label>
                    <p className="text-sm font-mono">{selectedAgentRun.ticketId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Goal</Label>
                    <p className="text-sm font-mono">{selectedAgentRun.goalId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Branch</Label>
                    <p className="text-sm font-mono truncate">{selectedAgentRun.branchName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Started</Label>
                    <p className="text-sm">{new Date(selectedAgentRun.startedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    Live agent stream
                    {(selectedAgentRun.status === "running" || selectedAgentRun.status === "starting") && <Badge variant="outline" className="border-green-500/40 px-1.5 py-0 text-[9px] text-green-500">Live</Badge>}
                  </Label>
                  <AgentStreamPanel events={agentStreams[selectedAgentRun.id] || agentStreams[selectedAgentRun.ticketId] || []} active={selectedAgentRun.status === "running" || selectedAgentRun.status === "starting"} />
                </div>
                {selectedAgentRun.output && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Final output</Label>
                    <div className="bg-muted p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto mt-1">
                      {selectedAgentRun.output}
                    </div>
                  </div>
                )}
                {selectedAgentRun.error && (
                  <div>
                    <Label className="text-xs text-red-500">Error</Label>
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto mt-1 text-red-500">
                      {selectedAgentRun.error}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setViewingAgentRun(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket Details Dialog */}
      <Dialog
        open={!!viewingTicketDetails}
        onOpenChange={(open) => !open && setViewingTicketDetails(null)}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[800px] lg:max-w-[1000px] max-h-[85vh] p-0 flex flex-col overflow-hidden">
          {viewingTicketDetails && (
            <div className="flex flex-col h-full overflow-hidden">
              <DialogHeader className="px-6 py-5 border-b shrink-0 bg-muted/10">
                <div className="flex items-start justify-between pr-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="font-mono bg-primary/10 text-primary uppercase text-[10px]">
                        {viewingTicketDetails.id}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${PRIORITY_COLORS[viewingTicketDetails.priority] || ""}`}
                      >
                        {viewingTicketDetails.priority}
                      </Badge>
                      <Badge variant="outline" className="capitalize text-[10px] bg-background">
                        {STATUS_LABELS[viewingTicketDetails.status] || viewingTicketDetails.status}
                      </Badge>
                      {viewingTicketDetails.type && (
                        <Badge variant="secondary" className="text-[10px]">
                          {viewingTicketDetails.type}
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">
                      {viewingTicketDetails.title}
                    </DialogTitle>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-2 shrink-0 bg-background border-b z-10 relative">
                  <TabsList variant="line" className="w-full justify-start p-0 gap-8 h-12">
                    <TabsTrigger value="overview" className="px-1 text-sm rounded-none pb-2 font-medium h-full">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="details" className="px-1 text-sm rounded-none pb-2 font-medium h-full">
                      Details & Criteria
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden relative bg-muted/5">
                  <TabsContent value="overview" className="h-full m-0 focus-visible:outline-none">
                    <ScrollArea className="flex-1 h-full px-6 py-6">
                      <div className="flex gap-8">
                        <div className="flex-1 flex flex-col gap-8">
                          <div>
                            <Label className="text-sm font-semibold mb-2 block text-foreground">
                              Description
                            </Label>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {viewingTicketDetails.description || "No description provided."}
                            </p>
                          </div>

                          <div>
                            <Label className="text-sm font-semibold mb-2 block text-foreground">
                              Technical Notes
                            </Label>
                            {viewingTicketDetails.technicalNotes.length > 0 ? (
                              <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
                                {viewingTicketDetails.technicalNotes.map((note, i) => (
                                  <li key={i}>{note}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">None</p>
                            )}
                          </div>

                          <div>
                            <Label className="text-sm font-semibold mb-2 block text-foreground">
                              Assigned Agent
                            </Label>
                            {viewingTicketDetails.assignedAgentId ? (
                              <div className="flex items-center gap-3 border bg-card rounded-lg p-3 w-fit pr-6">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                                    {goalAgentRuns
                                      .find((r) => r.ticketId === viewingTicketDetails.id)
                                      ?.provider.charAt(0)
                                      .toUpperCase() || "A"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">
                                    {goalAgentRuns.find((r) => r.ticketId === viewingTicketDetails.id)?.provider || "Agent"}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {viewingTicketDetails.assignedAgentId}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 border border-dashed rounded-lg p-3 bg-muted/30 text-muted-foreground w-fit pr-6">
                                <div className="h-8 w-8 rounded-full border border-dashed flex items-center justify-center bg-muted/50">
                                  <span className="text-xs">-</span>
                                </div>
                                <span className="text-sm font-medium">Unassigned</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <Label className="text-sm font-semibold mb-2 block text-foreground">
                              Dependencies
                            </Label>
                            {viewingTicketDetails.dependencyIds.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {viewingTicketDetails.dependencyIds.map((id) => (
                                  <Badge key={id} variant="secondary" className="font-mono text-[10px] uppercase bg-muted/80">
                                    {id}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No dependencies</p>
                            )}
                          </div>
                        </div>

                        <div className="w-[280px] flex flex-col gap-8 shrink-0">
                          <div className="flex flex-col gap-3">
                            <Label className="text-sm font-semibold flex items-center gap-2">
                              <FileCode className="w-4 h-4 text-muted-foreground" />
                              Relevant Files
                            </Label>
                            {viewingTicketDetails.relevantFiles.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {viewingTicketDetails.relevantFiles.map((file) => (
                                  <code key={file} className="text-[11px] bg-card border px-2.5 py-1.5 rounded-md font-mono text-muted-foreground truncate">
                                    {file}
                                  </code>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">None specified</span>
                            )}
                          </div>

                          <div className="flex flex-col gap-3">
                            <Label className="text-sm font-semibold flex items-center gap-2">
                              <History className="w-4 h-4 text-muted-foreground" />
                              Activity
                            </Label>
                            <div className="flex flex-col gap-1">
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Retries</Label>
                                <span className="text-sm font-medium ml-2">
                                  {viewingTicketDetails.retryCount} / {viewingTicketDetails.maximumRetries}
                                </span>
                              </div>
                              {viewingTicketDetails.worktreePath && (
                                <div className="mt-2">
                                  <Label className="text-[10px] text-muted-foreground">Worktree</Label>
                                  <code className="text-[10px] font-mono block truncate mt-0.5">
                                    {viewingTicketDetails.worktreePath}
                                  </code>
                                </div>
                              )}
                              {viewingTicketDetails.branchName && (
                                <div className="mt-2">
                                  <Label className="text-[10px] text-muted-foreground">Branch</Label>
                                  <code className="text-[10px] font-mono block truncate mt-0.5">
                                    {viewingTicketDetails.branchName}
                                  </code>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 pt-6 border-t">
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-muted-foreground">Created</Label>
                              <span className="text-sm font-medium">
                                {new Date(viewingTicketDetails.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-muted-foreground">Last Updated</Label>
                              <span className="text-sm font-medium">
                                {new Date(viewingTicketDetails.updatedAt).toLocaleString()}
                              </span>
                            </div>
                            {viewingTicketDetails.startedAt && (
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-muted-foreground">Started</Label>
                                <span className="text-sm font-medium">
                                  {new Date(viewingTicketDetails.startedAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                            {viewingTicketDetails.completedAt && (
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-muted-foreground">Completed</Label>
                                <span className="text-sm font-medium">
                                  {new Date(viewingTicketDetails.completedAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="details" className="h-full m-0 focus-visible:outline-none">
                    <ScrollArea className="flex-1 h-full px-6 py-6">
                      <div className="flex flex-col gap-8 max-w-2xl">
                        <div>
                          <Label className="text-sm font-semibold mb-2 block text-foreground">
                            Acceptance Criteria
                          </Label>
                          {viewingTicketDetails.acceptanceCriteria.length > 0 ? (
                            <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
                              {viewingTicketDetails.acceptanceCriteria.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No acceptance criteria defined</p>
                          )}
                        </div>

                        <div>
                          <Label className="text-sm font-semibold mb-2 block text-foreground">
                            Test Plan
                          </Label>
                          {viewingTicketDetails.testPlan.length > 0 ? (
                            <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
                              {viewingTicketDetails.testPlan.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No test plan defined</p>
                          )}
                        </div>

                        <div>
                          <Label className="text-sm font-semibold mb-2 block text-foreground">
                            Verification Commands
                          </Label>
                          {viewingTicketDetails.verificationCommands.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {viewingTicketDetails.verificationCommands.map((cmd, i) => (
                                <code key={i} className="text-sm bg-muted px-3 py-2 rounded-md font-mono">
                                  {cmd}
                                </code>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No verification commands</p>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>

              <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                <Button variant="outline" onClick={() => setViewingTicketDetails(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
