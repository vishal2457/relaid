import React, { useState } from "react";
import { useAgentSimulation } from "../hooks/useAgentSimulation";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import {
  Settings as SettingsIcon,
  TerminalSquare,
  Users,
  Plus,
  Trash2,
  Cpu,
  Folder,
  LayoutGrid,
} from "lucide-react";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";

const HARNESS_OPTIONS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini" },
  { id: "opencode", label: "OpenCode" },
];

const MODELS_BY_HARNESS: Record<string, string[]> = {
  claude: ["claude-3-5-sonnet", "claude-3-opus", "claude-3-haiku"],
  codex: ["code-cushman-001", "code-davinci-002"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
  opencode: ["opencode-34b", "opencode-7b"],
};

export function Settings() {
  const {
    projects,
    goals,
    addProject,
    deleteProject,
    addGoal,
    deleteGoal,
    orchestratorPrompt,
    setOrchestratorPrompt,
    orchestratorHarness,
    setOrchestratorHarness,
    orchestratorModel,
    setOrchestratorModel,
    agents,
    addAgent,
    updateAgent,
    deleteAgent,
    boardSteps,
    addBoardStep,
    updateBoardStep,
    deleteBoardStep,
  } = useAgentSimulation();

  const [activeTab, setActiveTab] = useState<
    "orchestrator" | "agents" | "projects" | "boards"
  >("orchestrator");

  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [newAgentHarness, setNewAgentHarness] = useState("claude");
  const [newAgentModel, setNewAgentModel] = useState("claude-3-5-sonnet");

  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [goalProjectId, setGoalProjectId] = useState<string | null>(null);

  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [newStepInstructions, setNewStepInstructions] = useState("");
  const [newStepAllowedNext, setNewStepAllowedNext] = useState<string[]>([]);
  const [newStepAllowedPrev, setNewStepAllowedPrev] = useState<string[]>([]);

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    addProject(newProjectName);
    setIsProjectDialogOpen(false);
    setNewProjectName("");
  };

  const handleCreateGoal = () => {
    if (!newGoalTitle.trim() || !goalProjectId) return;
    addGoal(goalProjectId, newGoalTitle);
    setIsGoalDialogOpen(false);
    setNewGoalTitle("");
    setGoalProjectId(null);
  };

  const handleCreateStep = () => {
    if (!newStepName.trim()) return;
    addBoardStep({
      name: newStepName,
      instructions: newStepInstructions,
      allowedNextSteps: newStepAllowedNext,
      allowedPreviousSteps: newStepAllowedPrev,
    });
    setIsStepDialogOpen(false);
    setNewStepName("");
    setNewStepInstructions("");
    setNewStepAllowedNext([]);
    setNewStepAllowedPrev([]);
  };

  const handleCreateAgent = () => {
    if (!newAgentName.trim() || !newAgentRole.trim()) return;
    addAgent(
      newAgentName,
      newAgentRole,
      newAgentPrompt,
      newAgentHarness,
      newAgentModel,
    );
    setIsAgentDialogOpen(false);
    setNewAgentName("");
    setNewAgentRole("");
    setNewAgentPrompt("");
    setNewAgentHarness("claude");
    setNewAgentModel("claude-3-5-sonnet");
  };

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-64 border-r bg-muted/10 shrink-0 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-border/50">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
            Settings
          </h2>
        </div>
        <div className="p-3 flex flex-col gap-1 overflow-y-auto">
          <Button
            variant={activeTab === "orchestrator" ? "secondary" : "ghost"}
            className="justify-start text-sm"
            onClick={() => setActiveTab("orchestrator")}
          >
            <TerminalSquare className="h-4 w-4 mr-2" />
            System Orchestrator
          </Button>
          <Button
            variant={activeTab === "agents" ? "secondary" : "ghost"}
            className="justify-start text-sm"
            onClick={() => setActiveTab("agents")}
          >
            <Users className="h-4 w-4 mr-2" />
            Active Agents
          </Button>
          <Button
            variant={activeTab === "projects" ? "secondary" : "ghost"}
            className="justify-start text-sm"
            onClick={() => setActiveTab("projects")}
          >
            <Folder className="h-4 w-4 mr-2" />
            Projects
          </Button>
          <Button
            variant={activeTab === "boards" ? "secondary" : "ghost"}
            className="justify-start text-sm"
            onClick={() => setActiveTab("boards")}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Boards & Steps
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-2 border-b px-6 py-4 shrink-0 bg-muted/5">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Settings</h2>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-4xl mx-auto pb-16">
            {activeTab === "orchestrator" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col gap-1">
                  <h3 className="text-2xl font-semibold tracking-tight">
                    System Orchestrator
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Manage the main intelligence governing the ticket
                    distribution and agent workflows.
                  </p>
                </div>

                <Card className="p-6 border-border/60 shadow-sm">
                  <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="flex flex-col gap-3">
                        <Label className="text-sm font-semibold">
                          Harness Engine
                        </Label>
                        <Select
                          value={orchestratorHarness}
                          onValueChange={(val) => {
                            setOrchestratorHarness(val);
                            setOrchestratorModel(MODELS_BY_HARNESS[val][0]);
                          }}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select harness" />
                          </SelectTrigger>
                          <SelectContent>
                            {HARNESS_OPTIONS.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                {h.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          The platform integration to handle orchestrator
                          requests.
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <Label className="text-sm font-semibold">Model</Label>
                        <Select
                          value={orchestratorModel}
                          onValueChange={setOrchestratorModel}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {MODELS_BY_HARNESS[orchestratorHarness]?.map(
                              (m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          The actual language model instance handling logic.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Label className="text-sm font-semibold">
                        System Prompt
                      </Label>
                      <textarea
                        className="flex min-h-[250px] w-full rounded-md border border-input bg-muted/20 px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
                        value={orchestratorPrompt}
                        onChange={(e) => setOrchestratorPrompt(e.target.value)}
                        placeholder="System orchestrator instructions..."
                      />
                      <p className="text-[11px] text-muted-foreground">
                        This defines the core behavior of your orchestrator when
                        evaluating tickets.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-semibold tracking-tight">
                      Active Agents
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configure specialized agents to handle different ticket
                      roles.
                    </p>
                  </div>
                  <Button
                    onClick={() => setIsAgentDialogOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New Agent
                  </Button>
                </div>

                <div className="mt-4">
                  {agents.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-4">
                      {agents.map((agent) => (
                        <AccordionItem
                          key={agent.id}
                          value={agent.id}
                          className="bg-card border-border/60 border rounded-lg px-6 overflow-hidden shadow-sm"
                        >
                          <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-4">
                                <h4 className="text-base font-semibold">
                                  {agent.name}
                                </h4>
                                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                                  {agent.role}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-muted-foreground hidden sm:inline-block">
                                  {agent.model}
                                </span>
                                <div
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 z-10 cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteAgent(agent.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-6 border-t mt-2">
                            <div className="flex flex-col gap-6 mt-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="flex flex-col gap-2.5">
                                  <Label className="text-xs font-medium text-muted-foreground">
                                    Harness Engine
                                  </Label>
                                  <Select
                                    value={agent.harness}
                                    onValueChange={(val) => {
                                      updateAgent(agent.id, {
                                        harness: val,
                                        model: MODELS_BY_HARNESS[val][0],
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HARNESS_OPTIONS.map((h) => (
                                        <SelectItem key={h.id} value={h.id}>
                                          {h.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="flex flex-col gap-2.5">
                                  <Label className="text-xs font-medium text-muted-foreground">
                                    Model
                                  </Label>
                                  <Select
                                    value={agent.model}
                                    onValueChange={(val) =>
                                      updateAgent(agent.id, { model: val })
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MODELS_BY_HARNESS[agent.harness]?.map(
                                        (m) => (
                                          <SelectItem key={m} value={m}>
                                            {m}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2.5">
                                <Label className="text-xs font-medium text-muted-foreground">
                                  Custom Prompt
                                </Label>
                                <textarea
                                  className="flex min-h-[100px] w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                                  value={agent.prompt}
                                  onChange={(e) =>
                                    updateAgent(agent.id, {
                                      prompt: e.target.value,
                                    })
                                  }
                                  placeholder="Agent prompt..."
                                />
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg bg-muted/10 text-muted-foreground">
                      <Users className="h-10 w-10 text-muted-foreground/30 mb-4" />
                      <p className="text-sm font-medium">
                        No active agents configured
                      </p>
                      <p className="text-xs mt-1">
                        Create an agent to start handling tickets.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-6"
                        onClick={() => setIsAgentDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Agent
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "projects" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-semibold tracking-tight">
                      Projects & Goals
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Manage active projects and their associated goals.
                    </p>
                  </div>
                  <Button onClick={() => setIsProjectDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Project
                  </Button>
                </div>

                <div className="mt-4">
                  {projects.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-4">
                      {projects.map((project) => {
                        const projectGoals = goals.filter(
                          (g) => g.projectId === project.id,
                        );
                        return (
                          <AccordionItem
                            key={project.id}
                            value={project.id}
                            className="bg-card border-border/60 border rounded-lg px-6 overflow-hidden shadow-sm"
                          >
                            <AccordionTrigger className="hover:no-underline py-4">
                              <div className="flex items-center justify-between w-full pr-4">
                                <div className="flex items-center gap-4">
                                  <h4 className="text-base font-semibold">
                                    {project.name}
                                  </h4>
                                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-sm">
                                    {projectGoals.length} Goals
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs text-muted-foreground">
                                    Created{" "}
                                    {project.createdAt.toLocaleDateString()}
                                  </span>
                                  <div
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 z-10 cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      deleteProject(project.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-6 border-t mt-2">
                              <div className="flex flex-col gap-4 mt-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-sm font-semibold text-muted-foreground">
                                    Project Goals
                                  </h5>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setGoalProjectId(project.id);
                                      setIsGoalDialogOpen(true);
                                    }}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Goal
                                  </Button>
                                </div>

                                <div className="mt-2 rounded-md border">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Goal Title</TableHead>
                                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {projectGoals.map((goal) => (
                                        <TableRow key={goal.id}>
                                          <TableCell className="font-medium">
                                            {goal.title}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 cursor-pointer transition-colors"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                deleteGoal(goal.id);
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      {projectGoals.length === 0 && (
                                        <TableRow>
                                          <TableCell colSpan={2} className="h-24 text-center">
                                            No goals defined for this project.
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg bg-muted/10 text-muted-foreground">
                      <Folder className="h-10 w-10 text-muted-foreground/30 mb-4" />
                      <p className="text-sm font-medium">No projects created</p>
                      <p className="text-xs mt-1">
                        Create a project to start adding goals and tickets.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-6"
                        onClick={() => setIsProjectDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Project
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === "boards" && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-semibold tracking-tight">
                      Boards & Steps
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configure custom Kanban boards and the allowed pathing
                      between ticket steps.
                    </p>
                  </div>
                  <Button onClick={() => setIsStepDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Step
                  </Button>
                </div>

                <div className="mt-4">
                  {boardSteps.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-4">
                      {boardSteps.map((step) => (
                        <AccordionItem
                          key={step.id}
                          value={step.id}
                          className="bg-card border-border/60 border rounded-lg px-6 overflow-hidden shadow-sm"
                        >
                          <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-4">
                                <h4 className="text-base font-semibold">
                                  {step.name}
                                </h4>
                                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded-sm">
                                  {step.id}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <div
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 z-10 cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteBoardStep(step.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-6 border-t mt-2">
                            <div className="flex flex-col gap-6 mt-4">
                              <div className="flex flex-col gap-2.5">
                                <Label className="text-xs font-medium text-muted-foreground">
                                  Step Instructions
                                </Label>
                                <textarea
                                  className="flex min-h-[100px] w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                                  value={step.instructions}
                                  onChange={(e) =>
                                    updateBoardStep(step.id, {
                                      instructions: e.target.value,
                                    })
                                  }
                                  placeholder="What should the agent do in this step?"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="flex flex-col gap-2.5">
                                  <Label className="text-xs font-medium text-muted-foreground">
                                    Allowed Next Steps (IDs, comma separated)
                                  </Label>
                                  <Input
                                    value={step.allowedNextSteps.join(",")}
                                    onChange={(e) =>
                                      updateBoardStep(step.id, {
                                        allowedNextSteps: e.target.value.split(",").filter(Boolean),
                                      })
                                    }
                                    className="h-9 text-sm font-mono"
                                  />
                                </div>
                                <div className="flex flex-col gap-2.5">
                                  <Label className="text-xs font-medium text-muted-foreground">
                                    Allowed Previous Steps (IDs, comma separated)
                                  </Label>
                                  <Input
                                    value={step.allowedPreviousSteps.join(",")}
                                    onChange={(e) =>
                                      updateBoardStep(step.id, {
                                        allowedPreviousSteps: e.target.value.split(",").filter(Boolean),
                                      })
                                    }
                                    className="h-9 text-sm font-mono"
                                  />
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg bg-muted/10 text-muted-foreground">
                      <LayoutGrid className="h-10 w-10 text-muted-foreground/30 mb-4" />
                      <p className="text-sm font-medium">No steps defined</p>
                      <p className="text-xs mt-1">
                        Create Kanban steps to manage ticket workflow.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-6"
                        onClick={() => setIsStepDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Step
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create New Agent Dialog */}
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="border-b pb-4 mb-4">
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Name</Label>
                <Input
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="e.g. Architect"
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Role Indicator</Label>
                <Input
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  placeholder="e.g. System Design"
                  className="h-10"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Harness Engine</Label>
                <Select
                  value={newAgentHarness}
                  onValueChange={(val) => {
                    setNewAgentHarness(val);
                    setNewAgentModel(MODELS_BY_HARNESS[val][0]);
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HARNESS_OPTIONS.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Model</Label>
                <Select value={newAgentModel} onValueChange={setNewAgentModel}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS_BY_HARNESS[newAgentHarness]?.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Custom Prompt</Label>
              <textarea
                className="flex min-h-[160px] w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
                value={newAgentPrompt}
                onChange={(e) => setNewAgentPrompt(e.target.value)}
                placeholder="You are an expert... Your rules are..."
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsAgentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAgent}
              disabled={!newAgentName.trim() || !newAgentRole.trim()}
            >
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b pb-4 mb-4">
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Project Name</Label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Website Redesign"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsProjectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim()}
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Goal Dialog */}
      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b pb-4 mb-4">
            <DialogTitle>Create New Goal</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Goal Title</Label>
              <Input
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="e.g. Update Homepage UI"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setIsGoalDialogOpen(false);
                setGoalProjectId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateGoal} disabled={!newGoalTitle.trim()}>
              Create Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Step Dialog */}
      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b pb-4 mb-4">
            <DialogTitle>Create New Board Step</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Step Name</Label>
              <Input
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value)}
                placeholder="e.g. Needs Design"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsStepDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateStep} disabled={!newStepName.trim()}>
              Create Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
