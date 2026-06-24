import React, { useState } from "react";
import { useAgentSimulation } from "../hooks/useAgentSimulation";
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
  DialogTrigger,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Bot,
  LayoutGrid,
  AlertTriangle,
  Plus,
  FolderOpen,
  Target,
  Users,
  Settings,
  Cpu,
  TerminalSquare,
  PanelRight,
  Clock,
  Link as LinkIcon,
  FileCode,
  History,
  CheckCircle2,
} from "lucide-react";

import { motion, AnimatePresence } from "motion/react";

function KanbanColumn({
  title,
  tickets,
  agents,
  status,
  onProvideInput,
  onTicketClick,
}: {
  title: string;
  tickets: any[];
  agents: any[];
  status: string;
  onProvideInput?: (ticket: any) => void;
  onTicketClick?: (ticket: any) => void;
}) {
  const columnTickets = tickets
    .filter((t) => t.status === status)
    .sort((a, b) => {
      // Push requiresInput tickets to the top
      if (a.requiresInput && !b.requiresInput) return -1;
      if (!a.requiresInput && b.requiresInput) return 1;
      return 0;
    });

  return (
    <div className="flex flex-col flex-1 gap-3 min-w-[250px] bg-muted/30 p-3 rounded-lg border">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {columnTickets.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 -mx-3 px-3">
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {columnTickets.map((ticket) => (
              <motion.div
                key={ticket.id}
                layout
                layoutId={ticket.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              >
                <Card
                  onClick={() => onTicketClick && onTicketClick(ticket)}
                  className={`p-3 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow relative cursor-pointer ${
                    ticket.requiresInput
                      ? "border-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] animate-pulse bg-yellow-500/5"
                      : ""
                  }`}
                >
                  {ticket.requiresInput && (
                    <div
                      className="absolute -top-2 -right-2 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onProvideInput) onProvideInput(ticket);
                      }}
                    >
                      <Badge
                        variant="default"
                        className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950 px-1.5 py-0 border-0 flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Needs Input
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <span className="font-medium text-sm leading-tight line-clamp-2">
                      {ticket.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        ticket.priority === "Critical"
                          ? "border-red-500/50 text-red-500 text-[10px] px-1.5 py-0"
                          : ticket.priority === "High"
                            ? "border-orange-500/50 text-orange-500 text-[10px] px-1.5 py-0"
                            : "border-muted-foreground/30 text-muted-foreground text-[10px] px-1.5 py-0"
                      }
                    >
                      {ticket.priority}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {ticket.id}
                    </span>
                    {ticket.assignedAgentId ? (
                      <div
                        className="relative flex items-center justify-center w-8 h-8 group"
                        title={`Progress: ${ticket.progress}%`}
                      >
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-muted/30"
                          />
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeDasharray={2 * Math.PI * 14}
                            strokeDashoffset={
                              2 * Math.PI * 14 * (1 - ticket.progress / 100)
                            }
                            strokeLinecap="round"
                            className="text-primary transition-all duration-500"
                          />
                        </svg>
                        <Avatar className="h-[22px] w-[22px] border-0">
                          <AvatarFallback className="text-[9px]">
                            {agents.find((a) => a.id === ticket.assignedAgentId)
                              ?.avatar || "?"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    ) : (
                      <div className="relative flex items-center justify-center w-8 h-8 group">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                            className="text-border/40"
                          />
                        </svg>
                        <div className="h-[22px] w-[22px] rounded-full flex items-center justify-center bg-muted/20">
                          <span className="text-[10px] text-muted-foreground">
                            -
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
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

export function Dashboard() {
  const {
    projects,
    goals,
    agents,
    tickets,
    orchestratorPrompt,
    boardSteps,
    addProject,
    addGoal,
    addAgent,
    resolveInput,
  } = useAgentSimulation();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id || "",
  );
  const [selectedGoalId, setSelectedGoalId] = useState<string>(
    goals.find((g) => g.projectId === projects[0]?.id)?.id || "",
  );

  const [newProjectName, setNewProjectName] = useState("");
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);

  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [resolvingTicket, setResolvingTicket] = useState<any | null>(null);
  const [resolveMessage, setResolveMessage] = useState("");

  const [viewingTicketDetails, setViewingTicketDetails] = useState<any | null>(
    null,
  );
  const [viewingAgent, setViewingAgent] = useState<any | null>(null);

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

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    const p = addProject(newProjectName);
    setSelectedProjectId(p.id);
    setSelectedGoalId("");
    setNewProjectName("");
    setIsProjectDialogOpen(false);
  };

  const handleCreateGoal = () => {
    if (!newGoalTitle.trim() || !selectedProjectId) return;
    const g = addGoal(selectedProjectId, newGoalTitle);
    setSelectedGoalId(g.id);
    setNewGoalTitle("");
    setIsGoalDialogOpen(false);
  };

  const handleOpenResolveDialog = (ticket: any) => {
    setResolvingTicket(ticket);
    setResolveMessage("");
    setIsResolveDialogOpen(true);
  };

  const handleResolveSubmit = () => {
    if (resolvingTicket && resolveMessage.trim()) {
      resolveInput(resolvingTicket.id, resolveMessage);
      setIsResolveDialogOpen(false);
      setResolvingTicket(null);
      setResolveMessage("");
    }
  };

  const currentProjectGoals = goals.filter(
    (g) => g.projectId === selectedProjectId,
  );
  const displayTickets = selectedGoalId
    ? tickets.filter((t) => t.goalId === selectedGoalId)
    : [];

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-hidden">
      {/* Project & Goal Selectors */}
      <div className="flex items-center gap-6 border-b px-6 py-4 bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <Label className="text-muted-foreground">Project: </Label>
          <Select value={selectedProjectId} onValueChange={handleProjectSelect}>
            <SelectTrigger className="w-[200px] h-8 bg-background">
              <SelectValue placeholder="Select Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
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
          <Dialog
            open={isProjectDialogOpen}
            onOpenChange={setIsProjectDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label>Project Name</Label>
                <Input
                  className="mt-2"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Core Platform v2"
                />
              </div>
              <DialogFooter>
                <Button onClick={handleCreateProject}>Create Project</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-3">
          <Target className="h-4 w-4 text-muted-foreground" />
          <Label className="text-muted-foreground">Goal: </Label>
          <Select
            value={selectedGoalId}
            onValueChange={setSelectedGoalId}
            disabled={!selectedProjectId || currentProjectGoals.length === 0}
          >
            <SelectTrigger className="w-[250px] h-8 bg-background">
              <SelectValue placeholder="Select Goal" />
            </SelectTrigger>
            <SelectContent>
              {currentProjectGoals.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
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
          <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Goal to Project</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label>Goal Title</Label>
                <Input
                  className="mt-2"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g. Refactor Auth Flow"
                />
              </div>
              <DialogFooter>
                <Button onClick={handleCreateGoal}>Create Goal</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          {/* Active Tickets section */}
          <div className="flex-1 flex flex-col overflow-hidden bg-card rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Kanban Board
                </h2>
                <Badge variant="secondary" className="ml-2">
                  {displayTickets.length} Total
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {agents.map((agent) => (
                  <Avatar
                    key={agent.id}
                    className={`h-8 w-8 cursor-pointer border-2 transition-all ${
                      agent.status === "working"
                        ? "border-green-500 ring-2 ring-green-500/20 shadow-[0_0_8px_rgba(34,197,94,0.3)] animate-pulse"
                        : "border-border/50"
                    }`}
                    onClick={() => setViewingAgent(agent)}
                  >
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground font-medium">
                      {agent.avatar}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-hidden">
              <div className="flex gap-4 h-full overflow-x-auto pb-2 scrollbar-custom">
                {boardSteps.map((step) => (
                  <KanbanColumn
                    key={step.id}
                    title={step.name}
                    tickets={displayTickets}
                    agents={agents}
                    status={step.id}
                    onProvideInput={handleOpenResolveDialog}
                    onTicketClick={setViewingTicketDetails}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isResolveDialogOpen} onOpenChange={setIsResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Action Required</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Ticket:</span>
              <span className="text-sm text-muted-foreground">
                {resolvingTicket?.title}
              </span>
            </div>

            <div className="flex flex-col gap-2 p-3 bg-red-50 text-red-900 border border-red-200 rounded-md">
              <span className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Agent Request:
              </span>
              <span className="text-sm">
                {resolvingTicket?.logs
                  ?.filter((l: any) => l.type === "error")
                  .pop()?.message ||
                  "Agent requires your input or permission to proceed."}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Provide Input for Agent</Label>
              <Input
                value={resolveMessage}
                onChange={(e) => setResolveMessage(e.target.value)}
                placeholder="Type your response or clarification here..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsResolveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveSubmit}
              disabled={!resolveMessage.trim()}
            >
              Submit Input
            </Button>
          </DialogFooter>
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
                      <Badge
                        variant="secondary"
                        className="font-mono bg-primary/10 text-primary uppercase"
                      >
                        {viewingTicketDetails.id}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          viewingTicketDetails.priority === "Critical"
                            ? "border-red-500 text-red-500 text-[10px]"
                            : viewingTicketDetails.priority === "High"
                              ? "border-orange-500 text-orange-500 text-[10px]"
                              : "text-[10px]"
                        }
                      >
                        {viewingTicketDetails.priority}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="capitalize text-[10px] bg-background"
                      >
                        {boardSteps.find(s => s.id === viewingTicketDetails.status)?.name || viewingTicketDetails.status}
                      </Badge>
                      {viewingTicketDetails.estimatedCompletionTime && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1">
                          <Clock className="w-3.5 h-3.5" />
                          {viewingTicketDetails.estimatedCompletionTime}
                        </span>
                      )}
                    </div>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">
                      {viewingTicketDetails.title}
                    </DialogTitle>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                defaultValue="overview"
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="px-6 pt-2 shrink-0 bg-background border-b z-10 relative">
                  <TabsList
                    variant="line"
                    className="w-full justify-start p-0 gap-8 h-12"
                  >
                    <TabsTrigger
                      value="overview"
                      className="px-1 text-sm rounded-none pb-2 font-medium h-full"
                    >
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="px-1 text-sm rounded-none pb-2 font-medium h-full"
                    >
                      Logs & History
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden relative bg-muted/5">
                  <TabsContent
                    value="overview"
                    className="h-full m-0 focus-visible:outline-none"
                  >
                    <div className="flex flex-col h-full">
                      <ScrollArea className="flex-1 px-6 py-6 border-none">
                        <div className="flex gap-8">
                          <div className="flex-1 flex flex-col gap-8">
                            {/* Description */}
                            <div>
                              <Label className="text-sm font-semibold mb-2 block text-foreground">
                                Description
                              </Label>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {viewingTicketDetails.description}
                              </p>
                            </div>

                            {/* Progress */}
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-semibold">
                                  Progress Status
                                </Label>
                                <span className="text-sm font-medium">
                                  {viewingTicketDetails.progress}%
                                </span>
                              </div>
                              <Progress
                                value={viewingTicketDetails.progress}
                                className="h-2.5"
                              />
                            </div>

                            {/* Agent Info */}
                            <div className="flex flex-col gap-3 mt-2">
                              <Label className="text-sm font-semibold">
                                Assigned Agent
                              </Label>
                              {viewingTicketDetails.assignedAgentId ? (
                                <div className="flex items-center gap-3 border bg-card rounded-lg p-3 w-fit pr-6">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                                      {agents.find(
                                        (a) =>
                                          a.id ===
                                          viewingTicketDetails.assignedAgentId,
                                      )?.avatar || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {agents.find(
                                        (a) =>
                                          a.id ===
                                          viewingTicketDetails.assignedAgentId,
                                      )?.name || "Unknown Agent"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {agents.find(
                                        (a) =>
                                          a.id ===
                                          viewingTicketDetails.assignedAgentId,
                                      )?.role || "General"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 border border-dashed rounded-lg p-3 bg-muted/30 text-muted-foreground w-fit pr-6">
                                  <div className="h-8 w-8 rounded-full border border-dashed flex items-center justify-center bg-muted/50">
                                    <span className="text-xs">-</span>
                                  </div>
                                  <span className="text-sm font-medium">
                                    Unassigned
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Sidebar Details */}
                          <div className="w-[280px] flex flex-col gap-8 shrink-0">
                            {/* Linked Tickets */}
                            <div className="flex flex-col gap-3">
                              <Label className="text-sm font-semibold flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-muted-foreground" />
                                Linked Tickets
                              </Label>
                              {viewingTicketDetails.linkedTickets &&
                              viewingTicketDetails.linkedTickets.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                  {viewingTicketDetails.linkedTickets.map(
                                    (id: string) => (
                                      <div
                                        key={id}
                                        className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors cursor-pointer group"
                                      >
                                        <Badge
                                          variant="secondary"
                                          className="font-mono text-[10px] uppercase bg-muted/80"
                                        >
                                          {id}
                                        </Badge>
                                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground line-clamp-1">
                                          Related Task
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground italic">
                                  No linked tickets
                                </span>
                              )}
                            </div>

                            {/* Affected files */}
                            <div className="flex flex-col gap-3">
                              <Label className="text-sm font-semibold flex items-center gap-2">
                                <FileCode className="w-4 h-4 text-muted-foreground" />
                                Affected Files
                              </Label>
                              {viewingTicketDetails.affectedFiles &&
                              viewingTicketDetails.affectedFiles.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                  {viewingTicketDetails.affectedFiles.map(
                                    (file: string) => (
                                      <div
                                        key={file}
                                        className="text-[11px] bg-card border px-2.5 py-1.5 rounded-md font-mono text-muted-foreground truncate"
                                        title={file}
                                      >
                                        {file}
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground italic">
                                  None specified
                                </span>
                              )}
                            </div>

                            {/* Timestamps */}
                            <div className="flex flex-col gap-3 pt-6 border-t">
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-muted-foreground">
                                  Created
                                </Label>
                                <span className="text-sm font-medium">
                                  {new Date(
                                    viewingTicketDetails.createdAt,
                                  ).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-xs text-muted-foreground">
                                  Last Updated
                                </Label>
                                <span className="text-sm font-medium">
                                  {new Date(
                                    viewingTicketDetails.updatedAt,
                                  ).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="history"
                    className="h-full m-0 focus-visible:outline-none"
                  >
                    <div className="flex flex-col h-full">
                      <ScrollArea className="flex-1 px-6 py-6 border-none">
                        <div className="flex items-center justify-between mb-4">
                          <Label className="text-sm font-semibold flex items-center gap-2">
                            <History className="w-4 h-4 text-muted-foreground" />
                            Activity History
                          </Label>
                        </div>

                        <div className="border bg-card rounded-lg p-1 min-h-[300px]">
                          {viewingTicketDetails.logs.length === 0 ? (
                            <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground italic">
                              No history logs found for this ticket.
                            </div>
                          ) : (
                            <div className="flex flex-col relative px-4 py-6">
                              <div className="absolute left-[31px] top-6 bottom-6 w-px bg-border"></div>
                              {viewingTicketDetails.logs.map((log: any) => (
                                <div
                                  key={log.id}
                                  className="flex gap-4 relative mb-6 last:mb-0 z-10"
                                >
                                  <div className="flex flex-col items-center pt-0.5">
                                    <div
                                      className={`h-4 w-4 rounded-full border-2 border-background flex-shrink-0 ${
                                        log.type === "error"
                                          ? "bg-red-500"
                                          : log.type === "success"
                                            ? "bg-green-500"
                                            : log.type === "action"
                                              ? "bg-blue-500"
                                              : "bg-gray-400"
                                      }`}
                                    />
                                  </div>
                                  <div className="flex flex-col flex-1 pb-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                                      <span
                                        className={`font-medium text-sm ${
                                          log.type === "error"
                                            ? "text-red-600 dark:text-red-400"
                                            : log.type === "success"
                                              ? "text-green-600 dark:text-green-400"
                                              : "text-foreground"
                                        }`}
                                      >
                                        {log.message}
                                      </span>
                                      <span className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded w-fit">
                                        {new Date(log.timestamp).toLocaleString(
                                          [],
                                          {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          },
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>

              <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                <Button
                  variant="outline"
                  onClick={() => setViewingTicketDetails(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Agent Activity Dialog */}
      <Dialog
        open={!!viewingAgent}
        onOpenChange={(open) => !open && setViewingAgent(null)}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {viewingAgent?.name}
              {viewingAgent?.status === "working" ? (
                <Badge
                  variant="outline"
                  className="ml-2 border-green-500 text-green-600 bg-green-500/10"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5"></div>
                  Working
                </Badge>
              ) : (
                <Badge variant="outline" className="ml-2">
                  Idle
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              Role: <Badge variant="secondary">{viewingAgent?.role}</Badge>
              <span className="text-muted-foreground ml-2">Model:</span>{" "}
              <span className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                {viewingAgent?.model}
              </span>
            </div>

            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mt-2">
              Activity Stream
            </Label>
            <div className="bg-black text-green-400 font-mono text-xs h-[300px] overflow-y-auto rounded-md p-4 flex flex-col gap-2 shadow-inner scrollbar-custom">
              {viewingAgent?.currentTicketId ? (
                <>
                  {tickets
                    .find((t) => t.id === viewingAgent.currentTicketId)
                    ?.logs.map((l: any, i: number) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-500 shrink-0">
                          [{new Date(l.timestamp).toLocaleTimeString()}]
                        </span>
                        <span
                          className={
                            l.type === "error"
                              ? "text-red-400"
                              : l.type === "success"
                                ? "text-blue-400"
                                : "text-green-400"
                          }
                        >
                          {l.message}
                        </span>
                      </div>
                    ))}
                  {viewingAgent?.status === "working" && (
                    <div className="flex gap-2 items-center text-gray-500 mt-2">
                      <span className="animate-pulse">_</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-gray-500 italic h-full flex items-center justify-center">
                  Agent is currently waiting for tasks...
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
