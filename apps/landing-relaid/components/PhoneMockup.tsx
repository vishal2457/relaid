"use client";

import {
  Activity,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Cpu,
  Diff,
  FileText,
  Files,
  Folder,
  GitBranch,
  Menu,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

type Message = {
  role: "agent" | "user";
  text: string;
  meta?: string;
};

const starterMessages: Message[] = [
  {
    role: "agent",
    meta: "Codex · mobile",
    text: "Connected to your MacBook. The mobile app is watching apps/mobile on main.",
  },
  {
    role: "user",
    text: "Check the failing mobile build and patch it.",
  },
  {
    role: "agent",
    meta: "Streaming",
    text: "Running pnpm check-types... found one prop mismatch in ChatComposer.",
  },
];

const quickPrompts = [
  "Review my git diff",
  "Fix the failing build",
  "Ship the landing copy",
];

const toolRuns = [
  { label: "pnpm check-types", detail: "Found 1 TypeScript issue" },
  { label: "Read ChatComposer.tsx", detail: "Located prop mismatch" },
  { label: "Apply patch", detail: "Updated composer action state" },
];

const changedFiles = [
  { path: "apps/mobile/src/components/ChatComposer.tsx", adds: 18, removes: 6 },
  { path: "apps/mobile/app/index.tsx", adds: 7, removes: 2 },
];

export function PhoneMockup() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [inputText, setInputText] = useState("Approve the safe patch");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPermission, setShowPermission] = useState(true);

  const queueAgentReply = (text: string, meta = "Relaid") => {
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { role: "agent", text, meta }]);
      setIsStreaming(false);
    }, 700);
  };

  const handleSend = () => {
    const prompt = inputText.trim();
    if (!prompt || isStreaming) return;

    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    setInputText("");
    setShowPermission(false);
    setIsStreaming(true);
    queueAgentReply("I can do that. First, approve the file edit request below.", "Permission needed");
    window.setTimeout(() => setShowPermission(true), 760);
  };

  const handlePermission = (reply: "once" | "always" | "deny") => {
    setShowPermission(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text:
          reply === "deny"
            ? "Deny this action."
            : reply === "once"
              ? "Allow this edit once."
              : "Always allow safe edits in this project.",
      },
    ]);

    if (reply === "deny") {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          meta: "Stopped",
          text: "No changes made. You stayed in control from the phone.",
        },
      ]);
      return;
    }

    setIsStreaming(true);
    queueAgentReply("Patch applied, branch is still cleanly tracked, and the build is running again.", "Done");
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="lg:col-span-5 flex justify-center items-center relative pt-4 lg:pt-0"
    >
      {/* Phone Hardware Mockup */}
      <div className="relative w-full max-w-[320px] sm:w-[280px] aspect-[9/19] bg-[#1A1A2E] rounded-[3rem] p-2.5 shadow-xl border border-[#1A1A2E]/70 outline outline-1 outline-offset-2 outline-[#1A1A2E]/70">
        {/* Camera cutout */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#1A1A2E] rounded-b-2xl z-20" />

        {/* Phone Screen */}
        <div className="relative w-full h-full bg-[#F8FAFC] rounded-[2.2rem] overflow-hidden flex flex-col font-sans">
          {/* Floating app controls */}
          <div className="absolute left-4 right-4 top-8 z-20 flex items-center justify-between">
            <button
              type="button"
              aria-label="Open sessions"
              className="w-8 h-8 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-[#1A1A2E]"
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm">
              <button
                type="button"
                aria-label="New session"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#1A1A2E] hover:bg-slate-50"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                aria-label="Git"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#1A1A2E] hover:bg-slate-50"
              >
                <GitBranch size={14} />
              </button>
              <button
                type="button"
                aria-label="Files"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#1A1A2E] hover:bg-slate-50"
              >
                <Files size={14} />
              </button>
              <button
                type="button"
                aria-label="Refresh"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#1A1A2E] hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Messages UI */}
          <div className="flex-1 overflow-y-auto px-4 pt-[5.5rem] pb-3 flex flex-col gap-2.5 no-scrollbar text-[11px]">
            <div className="mx-auto mb-1 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Relay connected
            </div>

            {messages.slice(-5).map((msg, i) => (
              <div key={`${msg.role}-${i}-${msg.text}`} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-3 py-2 leading-relaxed shadow-sm ${msg.role === "user" ? "bg-[#1D4ED8] text-white rounded-br-md" : "bg-white text-[#1A1A2E] rounded-bl-md border border-slate-200"}`}>
                  {msg.meta ? (
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {msg.meta}
                    </div>
                  ) : null}
                  {msg.text}
                </div>
              </div>
            ))}

            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-[#1A1A2E] shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <Wrench size={11} />
                Tools
              </div>
              <div className="flex flex-col gap-1.5">
                {toolRuns.map((tool) => (
                  <div
                    key={tool.label}
                    className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
                  >
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[10px] text-[#1A1A2E]">
                        {tool.label}
                      </div>
                      <div className="truncate text-[9px] text-slate-500">
                        {tool.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-[#1A1A2E] shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  <FileText size={11} />
                  Files Changed
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                  2 files
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {changedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
                  >
                    <div className="truncate font-mono text-[9px] text-slate-700">
                      {file.path}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[9px]">
                      <span className="text-emerald-600">+{file.adds}</span>
                      <span className="text-red-500">-{file.removes}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isStreaming ? (
              <div className="flex items-start">
                <div className="max-w-[86%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-[#1A1A2E] shadow-sm">
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Thinking
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1D4ED8]" />
                    Streaming output from your local agent
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {showPermission ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-3 mb-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-bold text-[#1A1A2E]">
                    Allow edit file?
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                    Codex wants to patch ChatComposer.tsx
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                  <Terminal size={14} />
                </div>
              </div>
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[9px] text-slate-600">
                apps/mobile/src/components/ChatComposer.tsx
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePermission("deny")}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-50"
                >
                  Deny
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePermission("once")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-[#1A1A2E] hover:bg-slate-50"
                  >
                    Once
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePermission("always")}
                    className="rounded-lg bg-[#1A1A2E] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-slate-800"
                  >
                    Always
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* Chat Input */}
          <div className="w-full shrink-0 border-t border-slate-200 bg-white p-2.5 pt-2.5 rounded-b-[2.2rem]">
            <div className="mb-1.5 flex gap-1.5 overflow-hidden">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInputText(prompt)}
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-medium text-slate-600 hover:bg-white"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="relative rounded-xl border border-slate-200 bg-[#F8FAFC] p-2 pb-1.5">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Send a message..."
                className="h-9 w-full resize-none bg-transparent px-1 text-[11px] leading-relaxed text-[#1A1A2E] outline-none placeholder:text-slate-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 overflow-hidden">
                  <button type="button" className="flex min-w-0 items-center gap-1 rounded-l-lg border border-r-0 border-slate-200 bg-white px-1.5 py-1 text-[8px] text-slate-700">
                    <Folder size={10} className="shrink-0 text-slate-500" />
                    <span className="truncate">mobile</span>
                  </button>
                  <button type="button" className="flex min-w-0 items-center gap-1 border border-r-0 border-slate-200 bg-white px-1.5 py-1 text-[8px] text-slate-700">
                    <Cpu size={10} className="shrink-0 text-slate-500" />
                    <span className="truncate">gpt-5.4</span>
                  </button>
                  <button type="button" className="flex min-w-0 items-center gap-1 rounded-r-lg border border-slate-200 bg-white px-1.5 py-1 text-[8px] text-slate-700">
                    <Sparkles size={10} className="shrink-0 text-slate-500" />
                    <span className="truncate">Codex</span>
                    <ChevronDown size={9} className="shrink-0 text-slate-400" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={isStreaming ? () => setIsStreaming(false) : handleSend}
                  disabled={!inputText.trim() && !isStreaming}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A1A2E] text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
                >
                  {isStreaming ? <CircleStop size={14} /> : <Send size={13} />}
                </button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
              <GitBranch size={11} />
              main
            </div>
          </div>
        </div>
      </div>

      {/* Floating tech badges */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        className="absolute top-32 -left-8 sm:-left-20 bg-white border-2 border-[#1A1A2E] px-3 py-2 hidden md:flex items-center gap-2 shadow-[4px_4px_0px_#1A1A2E] z-30"
      >
        <div className="p-1 bg-amber-100 rounded">
          <Zap size={14} className="text-amber-600" />
        </div>
        <span className="outfit text-[10px] font-bold tracking-widest uppercase text-[#1A1A2E]">Get Notified</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.9, duration: 0.8 }}
        className="absolute top-16 -right-6 sm:-right-14 bg-white border-2 border-[#1A1A2E] px-3 py-2 hidden md:flex items-center gap-2 shadow-[4px_4px_0px_#1A1A2E] z-30"
      >
        <div className="p-1 bg-violet-100 rounded">
          <GitBranch size={14} className="text-violet-600" />
        </div>
        <span className="outfit text-[10px] font-bold tracking-widest uppercase text-[#1A1A2E]">Git Integration</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.0, duration: 0.8 }}
        className="absolute bottom-28 -left-6 sm:-left-12 bg-white border-2 border-[#1A1A2E] px-3 py-2 hidden md:flex items-center gap-2 shadow-[4px_4px_0px_#1A1A2E] z-30"
      >
        <div className="p-1 bg-blue-100 rounded">
          <Activity size={14} className="text-blue-600" />
        </div>
        <span className="outfit text-[10px] font-bold tracking-widest uppercase text-[#1A1A2E]">Multiple Projects</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        className="absolute bottom-12 -right-5 sm:-right-16 bg-white border-2 border-[#1A1A2E] px-3 py-2 hidden md:flex items-center gap-2 shadow-[4px_4px_0px_#1A1A2E] z-30"
      >
        <div className="p-1 bg-emerald-100 rounded">
          <Diff size={14} className="text-emerald-600" />
        </div>
        <span className="outfit text-[10px] font-bold tracking-widest uppercase text-[#1A1A2E]">File Diff Viewer</span>
      </motion.div>
    </motion.div>
  );
}
