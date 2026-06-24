export type AgentStatus = "idle" | "working" | "offline";
export type LogType = "info" | "action" | "error" | "success";

export interface BoardStep {
  id: string;
  name: string;
  instructions: string;
  allowedNextSteps: string[];
  allowedPreviousSteps: string[];
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  prompt: string;
  harness: string;
  model: string;
  status: AgentStatus;
  currentTicketId?: string;
  completedCount: number;
}

export interface TicketLog {
  id: string;
  timestamp: Date;
  message: string;
  type: LogType;
}

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
}

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  goalId: string;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: string;
  progress: number;
  assignedAgentId?: string;
  requiresInput?: boolean;
  logs: TicketLog[];
  linkedTickets?: string[];
  affectedFiles?: string[];
  estimatedCompletionTime?: string;
  createdAt: Date;
  updatedAt: Date;
}
