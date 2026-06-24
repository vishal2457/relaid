import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { DEFAULT_WORKER_SYSTEM_PROMPT } from "../lib/constants";
import type { AgentProvider, BoardStep } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Bot, ChevronDown, ChevronUp, Folder, LayoutGrid, Loader2, Plus, Settings as SettingsIcon, Trash2, Users } from "lucide-react";

const STEP_COLORS: BoardStep["color"][] = ["slate", "blue", "amber", "green", "red"];

export function Settings() {
  const data = useRealtimeDashboard();
  const [activeTab, setActiveTab] = useState<"orchestrator" | "planner" | "agents" | "projects" | "boards">("orchestrator");
  const [orchestratorDraft, setOrchestratorDraft] = useState({ name: "", provider: "codex" as AgentProvider, model: "", systemPrompt: "" });
  const [plannerDraft, setPlannerDraft] = useState({ name: "", provider: "codex" as AgentProvider, model: "", systemPrompt: "" });
  const [dialog, setDialog] = useState<null | "agent" | "project" | "goal" | "step">(null);
  const [projectForGoal, setProjectForGoal] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [provider, setProvider] = useState<AgentProvider>("codex");
  const [model, setModel] = useState("");
  const [isTerminal, setIsTerminal] = useState(false);
  const [stepColor, setStepColor] = useState<BoardStep["color"]>("slate");

  const orchestratorSeededRef = useRef(false);
  const plannerSeededRef = useRef(false);
  useEffect(() => {
    if (data.orchestrator && !orchestratorSeededRef.current) {
      orchestratorSeededRef.current = true;
      setOrchestratorDraft({
        name: data.orchestrator.name,
        provider: data.orchestrator.provider,
        model: data.orchestrator.model,
        systemPrompt: data.orchestrator.systemPrompt,
      });
    }
  }, [data.orchestrator]);
  useEffect(() => {
    if (data.planningAgent && !plannerSeededRef.current) {
      plannerSeededRef.current = true;
      setPlannerDraft({ name: data.planningAgent.name, provider: data.planningAgent.provider, model: data.planningAgent.model, systemPrompt: data.planningAgent.systemPrompt });
    }
  }, [data.planningAgent]);

  const availableHarnesses = data.harnesses.filter((harness) => harness.available);
  const models = useMemo(() => data.harnesses.find((harness) => harness.id === provider)?.models ?? [], [data.harnesses, provider]);
  const resetDialog = () => { setDialog(null); setName(""); setDescription(""); setLocation(""); setProjectForGoal(""); setIsTerminal(false); setStepColor("slate"); };

  const createItem = async () => {
    if (!name.trim()) return;
    if (dialog === "project" && location.trim()) await data.addProject(name.trim(), location.trim());
    if (dialog === "goal" && projectForGoal) await data.addGoal(projectForGoal, name.trim(), description.trim());
    if (dialog === "agent" && model) await data.addAgent({ name: name.trim(), description: description.trim(), provider, model, systemPrompt: description.trim() || DEFAULT_WORKER_SYSTEM_PROMPT, permissionMode: "bypassPermissions", enabled: true });
    if (dialog === "step" && description.trim()) await data.addBoardStep({ name: name.trim(), instructions: description.trim(), allowedNextStepIds: [], allowedPreviousStepIds: [], isTerminal, color: stepColor });
    resetDialog();
  };

  if (data.loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  const tabs = [
    ["orchestrator", "System Orchestrator", Bot], ["planner", "Planning Agent", Bot], ["agents", "Active Agents", Users], ["projects", "Projects & Goals", Folder], ["boards", "Boards & Steps", LayoutGrid],
  ] as const;

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/10 md:flex">
        <div className="flex items-center gap-2 border-b p-6"><SettingsIcon className="h-5 w-5 text-muted-foreground" /><h2 className="font-semibold">Settings</h2></div>
        <nav className="flex flex-col gap-1 p-3">
          {tabs.map(([id, label, Icon]) => <Button key={id} variant={activeTab === id ? "secondary" : "ghost"} className="justify-start" onClick={() => setActiveTab(id)}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
        </nav>
      </aside>

      <main className="theme-scrollbar flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-4xl pb-16">
          {data.error && <div className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{data.error}</div>}

          {activeTab === "orchestrator" && <section className="space-y-6">
            <Heading title="System Orchestrator" description="Configure the brain that analyzes the board, moves tickets, and assigns agents after every run." />
            <Card className="space-y-6 p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Name"><Input value={orchestratorDraft.name} onChange={(event) => setOrchestratorDraft((draft) => ({ ...draft, name: event.target.value }))} /></Field>
                <Field label="Harness"><Select value={orchestratorDraft.provider} onValueChange={(value) => { const next = value as AgentProvider; setOrchestratorDraft((draft) => ({ ...draft, provider: next, model: data.harnesses.find((h) => h.id === next)?.models[0] || "" })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableHarnesses.map((h) => <SelectItem key={h.id} value={h.id} label={h.label}>{h.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Model"><Select value={orchestratorDraft.model} onValueChange={(value) => setOrchestratorDraft((draft) => ({ ...draft, model: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(data.harnesses.find((h) => h.id === orchestratorDraft.provider)?.models || []).map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
              </div>
              <Field label="System Prompt"><textarea className="min-h-64 w-full rounded-md border bg-muted/20 px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/50" value={orchestratorDraft.systemPrompt} onChange={(event) => setOrchestratorDraft((draft) => ({ ...draft, systemPrompt: event.target.value }))} /></Field>
              <div className="flex justify-end"><Button onClick={() => data.updateOrchestrator(orchestratorDraft)}>Save orchestrator</Button></div>
            </Card>
          </section>}

          {activeTab === "planner" && <section className="space-y-6">
            <Heading title="Planning Agent" description="This single dedicated agent inspects a goal and creates its dependency-aware ticket plan. It never manages the board." />
            <Card className="space-y-6 p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Name"><Input value={plannerDraft.name} onChange={(event) => setPlannerDraft((draft) => ({ ...draft, name: event.target.value }))} /></Field>
                <Field label="Harness"><Select value={plannerDraft.provider} onValueChange={(value) => { const next = value as AgentProvider; setPlannerDraft((draft) => ({ ...draft, provider: next, model: data.harnesses.find((h) => h.id === next)?.models[0] || "" })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableHarnesses.map((h) => <SelectItem key={h.id} value={h.id} label={h.label}>{h.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Model"><Select value={plannerDraft.model} onValueChange={(value) => setPlannerDraft((draft) => ({ ...draft, model: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(data.harnesses.find((h) => h.id === plannerDraft.provider)?.models || []).map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
              </div>
              <Field label="System Prompt"><textarea className="min-h-64 w-full rounded-md border bg-muted/20 px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/50" value={plannerDraft.systemPrompt} onChange={(event) => setPlannerDraft((draft) => ({ ...draft, systemPrompt: event.target.value }))} /></Field>
              <div className="flex justify-end"><Button onClick={() => data.updatePlanningAgent(plannerDraft)}>Save planning agent</Button></div>
            </Card>
          </section>}

          {activeTab === "agents" && <section className="space-y-6">
            <div className="flex items-start justify-between"><Heading title="Active Agents" description="Configure reusable worker profiles from live server data." /><Button onClick={() => { setProvider((availableHarnesses[0]?.id as AgentProvider) || "codex"); setModel(availableHarnesses[0]?.models[0] || ""); setDialog("agent"); }}><Plus className="mr-2 h-4 w-4" />New Agent</Button></div>
            <div className="space-y-3">{data.agents.map((agent) => <details key={agent.id} className="group rounded-lg border bg-card px-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-3 py-4"><span className="font-semibold">{agent.name}</span><Badge variant="outline">{agent.provider}</Badge><span className="ml-auto text-xs text-muted-foreground">{agent.model}</span><ChevronDown className="h-4 w-4 group-open:rotate-180" /></summary><div className="space-y-5 border-t py-5">
              <div className="grid gap-4 md:grid-cols-2"><Field label="Model"><Select value={agent.model} onValueChange={(value) => data.updateAgent(agent.id, { model: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.harnesses.find((h) => h.id === agent.provider)?.models.map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field><Field label="Status"><Button variant={agent.enabled ? "secondary" : "outline"} onClick={() => data.updateAgent(agent.id, { enabled: !agent.enabled })}>{agent.enabled ? "Enabled" : "Disabled"}</Button></Field></div>
              <Field label="System Prompt"><textarea defaultValue={agent.systemPrompt} onBlur={(event) => data.updateAgent(agent.id, { systemPrompt: event.target.value })} className="min-h-32 w-full rounded-md border bg-muted/20 p-3 font-mono text-xs" /></Field>
              <div className="flex justify-end"><Button variant="outline" className="text-red-500" onClick={() => data.deleteAgent(agent.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>
            </div></details>)}{data.agents.length === 0 && <Empty text="No worker agents configured." />}</div>
          </section>}

          {activeTab === "projects" && <section className="space-y-6">
            <div className="flex items-start justify-between"><Heading title="Projects & Goals" description="Create work against the projects already stored by the agent server." /><Button onClick={() => setDialog("project")}><Plus className="mr-2 h-4 w-4" />New Project</Button></div>
            <div className="space-y-3">{data.projects.map((project) => { const goals = data.goals.filter((goal) => goal.projectId === project.id); return <details key={project.id} className="group rounded-lg border bg-card px-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center py-4"><div><div className="font-semibold">{project.name}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{project.location}</div></div><Badge variant="secondary" className="ml-auto mr-3">{goals.length} goals</Badge><ChevronDown className="h-4 w-4 group-open:rotate-180" /></summary><div className="border-t py-4"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium">Goals</span><Button size="sm" variant="outline" onClick={() => { setProjectForGoal(project.id); setDialog("goal"); }}><Plus className="mr-1 h-3.5 w-3.5" />Add Goal</Button></div><div className="space-y-2">{goals.map((goal) => <div key={goal.id} className="flex items-center rounded-md border bg-muted/10 px-3 py-2"><span className="text-sm">{goal.title}</span><Badge variant="outline" className="ml-auto capitalize">{goal.status}</Badge></div>)}{goals.length === 0 && <p className="text-xs italic text-muted-foreground">No goals for this project.</p>}</div></div></details>; })}{data.projects.length === 0 && <Empty text="No projects configured." />}</div>
          </section>}

          {activeTab === "boards" && <section className="space-y-6">
            <div className="flex items-start justify-between"><Heading title="Boards & Steps" description="These persisted steps define the dashboard's kanban columns." /><Button onClick={() => setDialog("step")}><Plus className="mr-2 h-4 w-4" />New Step</Button></div>
            <div className="space-y-3">{data.boardSteps.map((step, index) => <details key={step.id} className="group rounded-lg border bg-card px-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-3 py-4"><span className="font-semibold">{step.name}</span><Badge variant="secondary">{step.isTerminal ? "Terminal" : `${step.allowedNextStepIds.length} next`}</Badge><span className="ml-auto font-mono text-[10px] text-muted-foreground">{step.id}</span><ChevronDown className="h-4 w-4 group-open:rotate-180" /></summary><div className="space-y-5 border-t py-5">
              <div className="grid gap-4 md:grid-cols-2"><Field label="Name"><Input defaultValue={step.name} onBlur={(event) => data.updateBoardStep(step.id, { name: event.target.value })} /></Field><Field label="Color"><Select value={step.color} onValueChange={(value) => data.updateBoardStep(step.id, { color: value as BoardStep["color"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STEP_COLORS.map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field></div>
              <Field label="Instructions"><textarea defaultValue={step.instructions} onBlur={(event) => data.updateBoardStep(step.id, { instructions: event.target.value })} className="min-h-24 w-full rounded-md border bg-muted/20 p-3 text-sm" /></Field>
              <div className="grid gap-5 md:grid-cols-2"><StepPicker label="Allowed next steps" steps={data.boardSteps} currentId={step.id} selected={step.allowedNextStepIds} onChange={(ids) => data.updateBoardStep(step.id, { allowedNextStepIds: ids })} /><StepPicker label="Allowed previous steps" steps={data.boardSteps} currentId={step.id} selected={step.allowedPreviousStepIds} onChange={(ids) => data.updateBoardStep(step.id, { allowedPreviousStepIds: ids })} /></div>
              <Field label="Execution"><Button variant={step.isTerminal ? "secondary" : "outline"} onClick={() => data.updateBoardStep(step.id, { isTerminal: !step.isTerminal })}>{step.isTerminal ? "Terminal step — no agent run" : "Executable step — starts an agent run"}</Button></Field>
              <div className="flex items-center justify-between"><div className="flex gap-2"><Button size="icon" variant="outline" disabled={index === 0} onClick={() => { const ids = data.boardSteps.map((item) => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; data.reorderBoardSteps(ids); }}><ChevronUp className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={index === data.boardSteps.length - 1} onClick={() => { const ids = data.boardSteps.map((item) => item.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; data.reorderBoardSteps(ids); }}><ChevronDown className="h-4 w-4" /></Button></div><Button variant="outline" className="text-red-500" onClick={() => data.deleteBoardStep(step.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>
            </div></details>)}{data.boardSteps.length === 0 && <Empty text="No board steps configured." />}</div>
          </section>}
        </div>
      </main>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && resetDialog()}><DialogContent><DialogHeader><DialogTitle>{dialog === "agent" ? "New Agent" : dialog === "project" ? "New Project" : dialog === "goal" ? "New Goal" : "New Board Step"}</DialogTitle></DialogHeader><div className="space-y-4 py-3"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        {dialog === "project" && <Field label="Repository Path"><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="/absolute/path/to/repository" /></Field>}
        {(dialog === "goal" || dialog === "agent" || dialog === "step") && <Field label={dialog === "agent" ? "System Prompt" : "Description"}><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-md border bg-muted/20 p-3 text-sm" /></Field>}
        {dialog === "agent" && <><Field label="Harness"><Select value={provider} onValueChange={(value) => { const next = value as AgentProvider; setProvider(next); setModel(data.harnesses.find((h) => h.id === next)?.models[0] || ""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableHarnesses.map((h) => <SelectItem key={h.id} value={h.id} label={h.label}>{h.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Model"><Select value={model} onValueChange={setModel}><SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger><SelectContent>{models.map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field></>}
        {dialog === "step" && <><Field label="Execution"><Button variant={isTerminal ? "secondary" : "outline"} onClick={() => setIsTerminal((value) => !value)}>{isTerminal ? "Terminal step" : "Executable step"}</Button></Field><Field label="Color"><Select value={stepColor} onValueChange={(value) => setStepColor(value as BoardStep["color"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STEP_COLORS.map((item) => <SelectItem key={item} value={item} label={item}>{item}</SelectItem>)}</SelectContent></Select></Field></>}
      </div><DialogFooter><Button onClick={createItem} disabled={!name.trim() || (dialog === "project" && !location.trim()) || (dialog === "goal" && !projectForGoal) || (dialog === "agent" && !model) || (dialog === "step" && !description.trim())}>Create</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Heading({ title, description }: { title: string; description: string }) { return <div><h3 className="text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">{text}</div>; }
function StepPicker({ label, steps, currentId, selected, onChange }: { label: string; steps: BoardStep[]; currentId: string; selected: string[]; onChange: (ids: string[]) => void }) { return <Field label={label}><div className="flex flex-wrap gap-2">{steps.filter((step) => step.id !== currentId).map((step) => { const active = selected.includes(step.id); return <button type="button" key={step.id} className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`} onClick={() => onChange(active ? selected.filter((id) => id !== step.id) : [...selected, step.id])}>{step.name}</button>; })}</div></Field>; }
