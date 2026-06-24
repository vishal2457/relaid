/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AgentSimulationProvider } from './hooks/useAgentSimulation';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Bot, Settings as SettingsIcon, LayoutDashboard } from 'lucide-react';

function Navigation({ currentTab, setCurrentTab }: { currentTab: string, setCurrentTab: (tab: string) => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b px-6 shrink-0 bg-background text-foreground z-10 relative">
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">
          AI Agent Ticket Desk
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentTab('dashboard')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentTab === 'dashboard' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
        >
          <SettingsIcon className="w-4 h-4" />
          Settings
        </button>
      </div>
    </header>
  );
}

function MainApp() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'settings'>('dashboard');

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
      <Navigation currentTab={currentTab} setCurrentTab={setCurrentTab} />
      <div className="flex-1 overflow-hidden relative">
        {currentTab === 'dashboard' ? <Dashboard /> : <Settings />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AgentSimulationProvider>
      <MainApp />
    </AgentSimulationProvider>
  );
}
