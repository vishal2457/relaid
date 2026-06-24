/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Bot, LayoutDashboard, Settings as SettingsIcon } from "lucide-react";
import { Dashboard } from "./components/Dashboard";
import { Settings } from "./components/Settings";

export default function App() {
  const [page, setPage] = useState<"dashboard" | "settings">("dashboard");
  return (
    <main className="theme-scrollbar flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /><h1 className="text-xl font-semibold tracking-tight">Agent Workbench</h1></div>
        <nav className="flex items-center gap-1">
          <button type="button" onClick={() => setPage("dashboard")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${page === "dashboard" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><LayoutDashboard className="h-4 w-4" />Dashboard</button>
          <button type="button" onClick={() => setPage("settings")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${page === "settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><SettingsIcon className="h-4 w-4" />Settings</button>
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{page === "dashboard" ? <Dashboard /> : <Settings />}</div>
    </main>
  );
}
