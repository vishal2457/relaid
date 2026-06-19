import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "./shared/components/ui/card";
import { Badge } from "./shared/components/ui/badge";
import { Button } from "./shared/components/ui/button";
import { Input } from "./shared/components/ui/input";
import { Textarea } from "./shared/components/ui/textarea";
import { Switch } from "./shared/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./shared/components/ui/dialog";
import { ScrollArea } from "./shared/components/ui/scroll-area";
import { Progress } from "./shared/components/ui/progress";
import { Separator } from "./shared/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shared/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shared/components/ui/select";
import {
  Play, Square, User, GitBranch, Clock, AlertTriangle,
  FolderOpen, Target, Check, X, Plus, ChevronRight,
  Activity, Loader2,
} from "lucide-react";
import { cn } from "./shared/utils/cn.utils";
import {
  listProjects, createProject,
  createGoal, getGoal,
  listTickets, createTickets, updateTicketStatus,
  startExecution, pauseExecution, cancelExecution,
  listAgentRuns, connectSse,
} from "./shared/api/client";
import type {
  Project, Goal, Ticket, AgentRun,
  TicketStatus, TicketType, TicketPriority,
} from "./models/domain";
import {
  TICKET_TYPE_LABELS, TICKET_TYPE_COLORS,
  PRIORITY_COLORS, STATUS_COLORS, KANBAN_COLUMNS,
} from "./models/domain";

function App() {
  const qc = useQueryClient();
  const [project, setProject] = useState<Project | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);

  // Dialogs
  const [showProjectDialog, setShowProjectDialog] = useState(true);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // SSE connection
  useEffect(() => {
    if (!goal) return;
    const sse = connectSse();
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.type === "ticket.status_changed" || data?.type === "goal.tickets_created") {
          setTickets(prev => prev.map(t =>
            t.id === data.ticketId ? { ...t, status: data.payload?.status ?? t.status } : t
          ));
        }
        if (data?.type?.startsWith("goal.")) {
          qc.invalidateQueries({ queryKey: ["goal", goal.id] });
        }
      } catch {}
    };
    return () => sse.close();
  }, [goal?.id]);

  // Poll agents when running
  const { data: polledAgents } = useQuery({
    queryKey: ["agents", goal?.id],
    queryFn: () => listAgentRuns(goal!.id),
    enabled: !!goal && goal.status === "running",
    refetchInterval: 3000,
  });
  useEffect(() => { if (polledAgents) setAgentRuns(polledAgents); }, [polledAgents]);

  // Poll tickets when running
  const { data: polledTickets } = useQuery({
    queryKey: ["tickets", goal?.id],
    queryFn: () => listTickets(goal!.id),
    enabled: !!goal && goal.status === "running",
    refetchInterval: 5000,
  });
  useEffect(() => { if (polledTickets) setTickets(polledTickets); }, [polledTickets]);

  // Poll goal status when running
  useQuery({
    queryKey: ["goal", goal?.id],
    queryFn: () => getGoal(goal!.id),
    enabled: !!goal && goal.status === "running",
    refetchInterval: 10000,
    select: (g: Goal) => { setGoal(g); return g; },
  });

  const toggleExecution = useCallback(async () => {
    if (!goal) return;
    if (goal.status === "running") {
      await pauseExecution(goal.id);
    } else if (goal.status === "paused") {
      await startExecution(goal.id, { maxAgents: goal.maxAgents, provider: goal.provider, maxRetries: goal.maxRetries, autoRetry: goal.autoRetry, autoMerge: goal.autoMerge, requireReview: goal.requireReview });
    }
    const g = await getGoal(goal.id);
    setGoal(g);
  }, [goal]);

  const handleCreateProject = async (data: Partial<Project>) => {
    const p = await createProject(data);
    setProject(p);
    setShowProjectDialog(false);
    setShowGoalDialog(true);
  };

  const handleSelectProject = (p: Project) => {
    setProject(p);
    setShowProjectDialog(false);
    setShowGoalDialog(true);
  };

  const handleCreateGoal = async (data: Partial<Goal>) => {
    if (!project) return;
    const g = await createGoal({ ...data, projectId: project.id });
    setGoal(g);
    setShowGoalDialog(false);

    // Auto-generate tickets and lock
    const ticketList = generateTickets(g);
    const created = await createTickets(g.id, ticketList);
    const updatedGoal = await startExecution(g.id, {
      maxAgents: g.maxAgents, provider: g.provider,
      maxRetries: g.maxRetries, autoRetry: g.autoRetry,
      autoMerge: g.autoMerge, requireReview: g.requireReview,
    });
    setTickets(created);
    const fullGoal = await getGoal(g.id);
    setGoal(fullGoal);
  };

  const completedCount = tickets.filter(t => t.status === "completed").length;
  const progress = tickets.length > 0 ? Math.round((completedCount / tickets.length) * 100) : 0;
  const activeAgents = agentRuns.filter(a => a.status === "running").length;
  const ticketsByStatus = (status: TicketStatus) => tickets.filter(t => t.status === status);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">Agent Workbench</h1>
          {project && (
            <Badge variant="outline" className="text-xs">
              <FolderOpen className="size-3 mr-1" />
              {project.name}
            </Badge>
          )}
          {goal && (
            <Badge variant="outline" className="text-xs">
              <Target className="size-3 mr-1" />
              {goal.title.slice(0, 40)}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4">
          {goal && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="size-4" />
                <span>{activeAgents} agent{activeAgents !== 1 ? "s" : ""} running</span>
              </div>
              <Separator orientation="vertical" className="h-5" />
              <Progress value={progress} className="w-24" />
              <span className="text-sm font-medium tabular-nums">{progress}%</span>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-sm text-muted-foreground">
                {completedCount}/{tickets.length} done
              </span>
              <Separator orientation="vertical" className="h-5" />
              {goal.status === "running" ? (
                <Button variant="outline" size="sm" onClick={toggleExecution}>
                  <Square className="size-3 mr-1" /> Pause
                </Button>
              ) : goal.status === "paused" ? (
                <Button variant="outline" size="sm" onClick={toggleExecution}>
                  <Play className="size-3 mr-1" /> Resume
                </Button>
              ) : null}
              {goal.status === "completed" && (
                <Badge className="bg-green-500/10 text-green-400">Completed</Badge>
              )}
              {goal.status === "failed" && (
                <Badge className="bg-red-500/10 text-red-400">Failed</Badge>
              )}
            </>
          )}
          {!project && (
            <Button onClick={() => setShowProjectDialog(true)}>
              Select Project
            </Button>
          )}
        </div>
      </header>

      {/* Kanban Board */}
      {goal ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-4 h-full min-w-max">
            {KANBAN_COLUMNS.map(column => {
              const items = ticketsByStatus(column.status);
              return (
                <div key={column.status} className="w-72 shrink-0 flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-sm font-semibold text-muted-foreground">{column.label}</h3>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="space-y-2 pr-1">
                      {items.map(ticket => (
                        <Card
                          key={ticket.id}
                          className="cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => setSelectedTicket(ticket)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", TICKET_TYPE_COLORS[ticket.type])}>
                                {TICKET_TYPE_LABELS[ticket.type]}
                              </Badge>
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[ticket.priority])}>
                                {ticket.priority}
                              </Badge>
                              {ticket.retryCount > 0 && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-400">
                                      <AlertTriangle className="size-2.5 mr-0.5" />{ticket.retryCount}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Retried {ticket.retryCount}/{ticket.maximumRetries}x</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-sm font-medium leading-tight mb-2 line-clamp-2">
                              {ticket.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {ticket.assignedAgentId && (
                                <span className="flex items-center gap-1"><User className="size-2.5" />{ticket.assignedAgentId}</span>
                              )}
                              {ticket.dependencyIds.length > 0 && (
                                <span className="flex items-center gap-1"><GitBranch className="size-2.5" />{ticket.dependencyIds.length}</span>
                              )}
                              {ticket.startedAt && (
                                <span className="flex items-center gap-1"><Clock className="size-2.5" />{new Date(ticket.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              )}
                            </div>
                            {ticket.branchName && (
                              <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate bg-muted/50 rounded px-1.5 py-0.5">
                                {ticket.branchName}
                              </div>
                            )}
                            {ticket.dependencyIds.filter(depId => !tickets.find(t => t.id === depId)?.status || tickets.find(t => t.id === depId)?.status !== "completed").length > 0 && (
                              <div className="mt-1.5 text-[11px] text-red-400">
                                Blocked by: {ticket.dependencyIds.filter(depId => tickets.find(t => t.id === depId)?.status !== "completed").join(", ")}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-8">—</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Activity className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No active goal</p>
            <p className="text-sm mt-1">Select a project and create a goal to get started.</p>
          </div>
        </div>
      )}

      {/* Project Selection Dialog */}
      <ProjectDialog
        open={showProjectDialog}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
      />

      {/* Goal Creation Dialog */}
      {project && (
        <GoalDialog
          open={showGoalDialog}
          onClose={() => setShowGoalDialog(false)}
          onCreate={handleCreateGoal}
          project={project}
        />
      )}

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedTicket?.title}</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <TicketDetail
              ticket={selectedTicket}
              agents={agentRuns.filter(a => a.ticketId === selectedTicket.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Project Selection Dialog ---
function ProjectDialog({ open, onSelect, onCreate }: {
  open: boolean;
  onSelect: (p: Project) => void;
  onCreate: (data: Partial<Project>) => Promise<void>;
}) {
  const [mode, setMode] = useState<"select" | "new" | null>(null);
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: listProjects, enabled: open });
  const [form, setForm] = useState({ name: "", location: "", description: "", baseBranch: "main" });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await onCreate({ ...form, techPreferences: [], testCommand: "", lintCommand: "", typeCheckCommand: "", buildCommand: "" });
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Select Project</DialogTitle></DialogHeader>
        {!mode ? (
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start h-auto py-4" onClick={() => setMode("select")}>
              <FolderOpen className="size-5 mr-3 text-primary" />
              <div className="text-left">
                <p className="font-medium">Existing Project</p>
                <p className="text-xs text-muted-foreground">Pick a previously configured project</p>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-4" onClick={() => setMode("new")}>
              <Plus className="size-5 mr-3 text-primary" />
              <div className="text-left">
                <p className="font-medium">New Project</p>
                <p className="text-xs text-muted-foreground">Point to a Git repo to start fresh</p>
              </div>
            </Button>
          </div>
        ) : mode === "select" ? (
          <div>
            <button className="text-sm text-muted-foreground hover:text-foreground mb-3" onClick={() => setMode(null)}>Back</button>
            {projects?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No projects yet. Create one.</p>}
            <div className="space-y-2">
              {projects?.map(p => (
                <Card key={p.id} className="cursor-pointer hover:border-primary" onClick={() => onSelect(p)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-muted-foreground truncate max-w-60">{p.location}</p></div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button className="text-sm text-muted-foreground hover:text-foreground mb-3" onClick={() => setMode(null)}>Back</button>
            <div className="space-y-3">
              <Input placeholder="Project name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="Path to repository" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
              <Input placeholder="Description (optional)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              <Input placeholder="Base branch" value={form.baseBranch} onChange={e => setForm(p => ({ ...p, baseBranch: e.target.value }))} />
              <Button className="w-full" disabled={!form.name || !form.location || creating} onClick={handleCreate}>
                {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                Create Project
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Goal Creation Dialog ---
function GoalDialog({ open, onClose, onCreate, project }: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Goal>) => Promise<void>;
  project: Project;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [criteriaInput, setCriteriaInput] = useState("");
  const [maxAgents, setMaxAgents] = useState("3");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [creating, setCreating] = useState(false);

  const addCriteria = () => {
    const t = criteriaInput.trim();
    if (t && !acceptanceCriteria.includes(t)) {
      setAcceptanceCriteria(prev => [...prev, t]);
    }
    setCriteriaInput("");
  };

  const handleCreate = async () => {
    setCreating(true);
    await onCreate({
      title, description, acceptanceCriteria,
      maxAgents: Number(maxAgents), provider,
      maxRetries: 3, autoRetry: true, autoMerge: false, requireReview: true,
      constraints: [], relevantFiles: [], outOfScopeItems: [],
    });
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Define Goal</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Project: {project.name}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">What do you want built?</label>
            <Input
              placeholder="e.g., Add org-level multi-tenancy to the CRM"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Describe what you need in detail..."
              className="min-h-20"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Acceptance Criteria</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Contacts cannot be accessed across orgs"
                value={criteriaInput}
                onChange={e => setCriteriaInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCriteria()}
              />
              <Button variant="outline" size="icon" onClick={addCriteria}><Plus className="size-4" /></Button>
            </div>
            <div className="space-y-1 mt-2">
              {acceptanceCriteria.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2">
                  <Check className="size-3 text-green-400 shrink-0" />
                  <span className="flex-1 text-xs">{c}</span>
                  <button onClick={() => setAcceptanceCriteria(prev => prev.filter((_, j) => j !== i))}>
                    <X className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Agents</label>
              <Input type="number" min="1" max="5" value={maxAgents} onChange={e => setMaxAgents(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select value={provider} onValueChange={v => setProvider(v as "claude" | "codex")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">Claude Code</SelectItem>
                  <SelectItem value="codex">Codex CLI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!title.trim() || acceptanceCriteria.length === 0 || creating}
            onClick={handleCreate}
          >
            {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Ticket Detail (in dialog) ---
function TicketDetail({ ticket, agents }: { ticket: Ticket; agents: AgentRun[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/50 rounded p-2">
          <p className="text-[10px] text-muted-foreground">Priority</p>
          <p className="text-sm font-medium capitalize">{ticket.priority}</p>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <p className="text-[10px] text-muted-foreground">Type</p>
          <p className="text-sm font-medium">{TICKET_TYPE_LABELS[ticket.type]}</p>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <p className="text-[10px] text-muted-foreground">Retries</p>
          <p className="text-sm font-medium">{ticket.retryCount}/{ticket.maximumRetries}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Description</p>
        <p className="text-sm text-muted-foreground">{ticket.description}</p>
      </div>

      {ticket.acceptanceCriteria.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Acceptance Criteria</p>
          <div className="space-y-1">
            {ticket.acceptanceCriteria.map((ac, i) => (
              <div key={i} className="flex items-center gap-2 text-sm"><Check className="size-3 text-green-400 shrink-0" />{ac}</div>
            ))}
          </div>
        </div>
      )}

      {ticket.relevantFiles.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Relevant Files</p>
          {ticket.relevantFiles.map(f => (
            <code key={f} className="block text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 mt-1">{f}</code>
          ))}
        </div>
      )}

      {ticket.dependencyIds.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Dependencies</p>
          <div className="flex flex-wrap gap-1">
            {ticket.dependencyIds.map(depId => (
              <Badge key={depId} variant="secondary" className="text-xs font-mono">{depId}</Badge>
            ))}
          </div>
        </div>
      )}

      {ticket.testPlan.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Test Plan</p>
          <div className="space-y-1">
            {ticket.testPlan.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="size-3 rounded-full border border-muted-foreground/30 flex items-center justify-center shrink-0">
                  <span className="text-[8px]">{i + 1}</span>
                </div>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.verificationCommands.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Verification</p>
          {ticket.verificationCommands.map((cmd, i) => (
            <code key={i} className="block text-xs bg-muted rounded px-2 py-1 mt-1">{cmd}</code>
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Agent Runs</p>
          <div className="space-y-1">
            {agents.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1 text-xs">
                <span>{a.provider} · {a.id}</span>
                <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.worktreePath && (
        <div>
          <p className="text-sm font-medium mb-1">Worktree</p>
          <code className="block text-xs bg-muted rounded px-2 py-1 break-all">{ticket.worktreePath}</code>
        </div>
      )}
    </div>
  );
}

// --- Auto-generate tickets from goal ---
function generateTickets(goal: Goal): Partial<Ticket>[] {
  const criteria = goal.acceptanceCriteria;
  const tickets: Partial<Ticket>[] = [];

  if (criteria.length > 0) {
    tickets.push({
      title: `Write failing tests for: ${criteria[0]}`,
      description: `Create tests that validate: ${criteria[0]}. These tests should fail initially because the feature is not yet implemented.`,
      type: "test",
      priority: "critical",
      acceptanceCriteria: [criteria[0]!],
      relevantFiles: goal.relevantFiles,
      testPlan: [`Write test for: ${criteria[0]}`, "Run test and verify it fails"],
      verificationCommands: goal.relevantFiles.length > 0 ? ["npm test"] : [],
    });
  }

  tickets.push({
    title: `Implement: ${goal.title}`,
    description: goal.description || `Implement the changes described in the goal: ${goal.title}`,
    type: "implementation",
    priority: "high",
    acceptanceCriteria: criteria,
    relevantFiles: goal.relevantFiles,
    dependencyIds: tickets.length > 0 ? [tickets[tickets.length - 1]!.id || "t-impl"] : [],
    testPlan: ["Implement the solution", "Run tests", "Verify acceptance criteria"],
    verificationCommands: ["npm test", "npm run lint || true", "npm run check-types || true"],
  });

  if (criteria.length > 1) {
    tickets.push({
      title: `Verify: ${criteria.slice(1).join(", ")}`,
      description: `Integration verification of remaining criteria: ${criteria.slice(1).join(", ")}`,
      type: "verification",
      priority: "medium",
      acceptanceCriteria: criteria.slice(1),
      relevantFiles: goal.relevantFiles,
      dependencyIds: [tickets[tickets.length - 1]!.id || "t-verify"],
      testPlan: ["Run full test suite", "Manual verification"],
      verificationCommands: ["npm test"],
    });
  }

  return tickets;
}

export default App;
