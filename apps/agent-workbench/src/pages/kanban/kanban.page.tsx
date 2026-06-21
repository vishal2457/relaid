import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/components/ui/card";
import { Badge } from "../../shared/components/ui/badge";
import { Button } from "../../shared/components/ui/button";
import { ScrollArea } from "../../shared/components/ui/scroll-area";
import { Separator } from "../../shared/components/ui/separator";
import { Progress } from "../../shared/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/components/ui/tooltip";
import {
  Play,
  Pause,
  RotateCcw,
  GitBranch,
  User,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../shared/utils/cn.utils";
import type {
  Ticket,
  TicketStatus,
} from "../../models/domain";
import {
  TICKET_TYPE_LABELS,
  TICKET_TYPE_COLORS,
  PRIORITY_COLORS,
  STATUS_COLORS,
  KANBAN_COLUMNS,
} from "../../models/domain";

const mockTickets: Ticket[] = [
  {
    id: "t-1", projectId: "p-1", goalId: "g-1",
    title: "Add failing repository tests for organization-scoped contacts",
    description: "Write tests proving contacts cannot be accessed across organization boundaries.",
    type: "test", status: "in_progress", priority: "critical",
    acceptanceCriteria: ["Test fails with cross-org access", "Test passes with same-org access"],
    technicalNotes: ["Use existing test framework"],
    relevantFiles: ["src/repos/contacts.ts"], dependencyIds: [], blockingTicketIds: ["t-2", "t-3"],
    assignedAgentId: "agent-1", worktreePath: "/tmp/wt/t-1", branchName: "agent/g-1/t-1",
    testPlan: ["Write cross-org access test"], verificationCommands: ["npm test -- contacts"],
    retryCount: 0, maximumRetries: 3, createdAt: "2026-06-01", updatedAt: "2026-06-01", startedAt: "2026-06-01",
  },
  {
    id: "t-2", projectId: "p-1", goalId: "g-1",
    title: "Add organization_id column to contacts table",
    description: "Database migration adding organization_id foreign key.",
    type: "implementation", status: "ready", priority: "high",
    acceptanceCriteria: ["Column exists", "FK constraint enforced"],
    technicalNotes: ["Use Drizzle migrations"], relevantFiles: ["src/db/schema.ts"],
    dependencyIds: ["t-1"], blockingTicketIds: [],
    testPlan: ["Run migration"], verificationCommands: ["npm run db:migrate"],
    retryCount: 0, maximumRetries: 3, createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "t-3", projectId: "p-1", goalId: "g-1",
    title: "Implement organization-scoped contact queries",
    description: "Add org_id filter to all contact repository methods.",
    type: "implementation", status: "blocked", priority: "high",
    acceptanceCriteria: ["Queries filter by org"],
    technicalNotes: ["Add WHERE clause"], relevantFiles: ["src/repos/contacts.ts"],
    dependencyIds: ["t-1", "t-2"], blockingTicketIds: [],
    testPlan: ["Update query tests"], verificationCommands: ["npm test -- contacts"],
    retryCount: 0, maximumRetries: 2, createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "t-4", projectId: "p-1", goalId: "g-1",
    title: "Add integration tests for org-scoped API endpoints",
    description: "End-to-end tests for CRUD operations with org scoping.",
    type: "integration", status: "backlog", priority: "medium",
    acceptanceCriteria: ["Cross-org access returns 403"],
    technicalNotes: ["Use supertest"], relevantFiles: ["tests/integration/contacts.test.ts"],
    dependencyIds: ["t-3"], blockingTicketIds: [],
    testPlan: ["Write integration tests"], verificationCommands: ["npm run test:integration"],
    retryCount: 0, maximumRetries: 2, createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "t-5", projectId: "p-1", goalId: "g-1",
    title: "Research existing org patterns in codebase",
    description: "Survey existing multi-tenancy patterns.",
    type: "research", status: "completed", priority: "medium",
    acceptanceCriteria: ["Patterns documented"], technicalNotes: [],
    relevantFiles: ["src/models/organization.ts"], dependencyIds: [], blockingTicketIds: [],
    testPlan: [], verificationCommands: [], assignedAgentId: "agent-2",
    retryCount: 0, maximumRetries: 1, createdAt: "2026-06-01", updatedAt: "2026-06-01",
    startedAt: "2026-06-01", completedAt: "2026-06-01",
  },
  {
    id: "t-6", projectId: "p-1", goalId: "g-1",
    title: "Refactor contact service to use org context",
    description: "Pass org context through service layer.",
    type: "refactor", status: "backlog", priority: "low",
    acceptanceCriteria: ["Service uses org context"], technicalNotes: [],
    relevantFiles: ["src/services/contacts.ts"], dependencyIds: ["t-3"],
    blockingTicketIds: [], testPlan: [], verificationCommands: [],
    retryCount: 0, maximumRetries: 2, createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "t-7", projectId: "p-1", goalId: "g-1",
    title: "Verify full org isolation across all modules",
    description: "Final verification of complete org isolation.",
    type: "verification", status: "backlog", priority: "critical",
    acceptanceCriteria: ["Full isolation verified"], technicalNotes: [],
    relevantFiles: [], dependencyIds: ["t-4", "t-6"], blockingTicketIds: [],
    testPlan: ["Full regression"], verificationCommands: ["npm test"],
    retryCount: 0, maximumRetries: 2, createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
  {
    id: "t-8", projectId: "p-1", goalId: "g-1",
    title: "Document organization scoping behavior",
    description: "Update developer documentation.",
    type: "documentation", status: "failed", priority: "low",
    acceptanceCriteria: ["Docs updated"], technicalNotes: [],
    relevantFiles: ["docs/multi-tenancy.md"], dependencyIds: [], blockingTicketIds: [],
    assignedAgentId: "agent-3", testPlan: [], verificationCommands: [],
    retryCount: 1, maximumRetries: 3,
    createdAt: "2026-06-01", updatedAt: "2026-06-01",
  },
];

export function KanbanPage() {
  const [tickets, setTickets] = useState<Ticket[]>(mockTickets);
  const [isRunning, setIsRunning] = useState(false);
  const completedCount = tickets.filter((t) => t.status === "completed").length;
  const progress = Math.round((completedCount / tickets.length) * 100);

  const ticketsByStatus = (status: TicketStatus) =>
    tickets.filter((t) => t.status === status);

  const moveTicket = (ticketId: string, newStatus: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: newStatus, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold">Kanban Board</h2>
            <p className="text-sm text-muted-foreground">
              Goal: Add Organization Multi-tenancy
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {completedCount}/{tickets.length} tickets
            </span>
            <Progress value={progress} className="w-32" />
            <span className="text-sm font-medium">{progress}%</span>
            <Separator orientation="vertical" className="mx-2 h-6" />
            {isRunning ? (
              <Button variant="outline" size="sm" onClick={() => setIsRunning(false)}>
                <Pause className="size-4 mr-1" /> Pause
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIsRunning(true)}>
                <Play className="size-4 mr-1" /> Start
              </Button>
            )}
            <Button variant="outline" size="sm">
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 min-h-full">
          {KANBAN_COLUMNS.map((column) => {
            const items = ticketsByStatus(column.status);
            return (
              <div key={column.status} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{column.label}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {items.map((ticket) => (
                    <Card
                      key={ticket.id}
                      className={cn(
                        "cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md",
                      )}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] px-1.5 py-0", TICKET_TYPE_COLORS[ticket.type])}
                          >
                            {TICKET_TYPE_LABELS[ticket.type]}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[ticket.priority])}
                          >
                            {ticket.priority}
                          </Badge>
                          {ticket.retryCount > 0 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 text-red-400"
                                >
                                  <AlertTriangle className="size-3 mr-0.5" />
                                  {ticket.retryCount}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Retried {ticket.retryCount}/{ticket.maximumRetries} times
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        <p className="text-sm font-medium leading-tight mb-2">
                          {ticket.title}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {ticket.assignedAgentId && (
                            <span className="flex items-center gap-1">
                              <User className="size-3" />
                              {ticket.assignedAgentId}
                            </span>
                          )}
                          {ticket.dependencyIds.length > 0 && (
                            <span className="flex items-center gap-1">
                              <GitBranch className="size-3" />
                              {ticket.dependencyIds.length}
                            </span>
                          )}
                          {ticket.startedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {new Date(ticket.startedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>

                        {ticket.worktreePath && (
                          <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate bg-muted/50 rounded px-2 py-1">
                            {ticket.branchName}
                          </div>
                        )}

                        {ticket.dependencyIds.filter(
                          (depId) =>
                            !tickets.find((t) => t.id === depId) ||
                            tickets.find((t) => t.id === depId)?.status !==
                              "completed",
                        ).length > 0 && (
                          <div className="mt-2 text-xs text-red-400">
                            Blocked by:{" "}
                            {ticket.dependencyIds
                              .filter(
                                (depId) =>
                                  tickets.find((t) => t.id === depId)?.status !==
                                  "completed",
                              )
                              .join(", ")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No tickets
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
