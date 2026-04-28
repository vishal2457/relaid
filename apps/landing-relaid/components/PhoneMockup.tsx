"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Send, ChevronDown } from "lucide-react";

export function PhoneMockup() {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Connected to Claude Code on localhost:3000. How can I help?' },
    { role: 'user', text: 'Create a new React hook for fetching data' },
    { role: 'agent', text: 'Generating useFetch.ts...' }
  ]);
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', text: inputText }]);
    setInputText('');
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'agent', text: 'Thinking...' }]);
    }, 600);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="lg:col-span-5 flex justify-center items-center relative pt-4 lg:pt-0"
    >
      {/* Phone Hardware Mockup */}
      <div className="relative w-full max-w-[320px] sm:w-[280px] aspect-[9/19] bg-[#1A1A2E] rounded-[3rem] p-3 shadow-2xl manga-panel">
        {/* Camera cutout */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1A1A2E] rounded-b-2xl z-20" />

        {/* Phone Screen */}
        <div className="relative w-full h-full bg-white rounded-[2.2rem] overflow-hidden flex flex-col font-sans">

          {/* App Header */}
          <div className="px-5 pt-8 pb-3 bg-white/90 border-b border-slate-100 flex justify-between items-center z-10 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[#1A1A2E] font-heading font-bold text-sm tracking-wide">Main Workstation</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-1 h-3 bg-slate-300 rounded-sm" />
              <div className="w-1 h-4 bg-slate-400 rounded-sm" />
              <div className="w-1 h-5 bg-[#1A1A2E] rounded-sm" />
            </div>
          </div>

          {/* Messages UI */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-2 no-scrollbar font-mono text-xs">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${msg.role === 'user' ? 'bg-[#1A1A2E] text-white rounded-br-none' : 'bg-slate-50 text-[#1A1A2E] rounded-bl-none border border-slate-200'}`}>
                  {msg.role === 'agent' && <div className="text-slate-500 font-bold mb-1 opacity-80 uppercase text-[9px] tracking-wider">Agent</div>}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div className="w-full bg-white border-t border-slate-100 shrink-0 p-3 pt-4 rounded-b-[2.2rem]">
            <div className="relative bg-slate-50 rounded-xl border border-slate-200 p-2 flex flex-col gap-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message agent..."
                className="w-full bg-transparent text-xs font-mono text-[#1A1A2E] placeholder-slate-400 outline-none resize-none h-10 px-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex justify-between items-center mt-1">
                {/* Project & Model Selection */}
                <div className="flex gap-1.5">
                  <button className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2 py-1 rounded transition-colors shadow-sm">
                    Claude <ChevronDown size={10} />
                  </button>
                  <button className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2 py-1 rounded transition-colors shadow-sm">
                    frontend <ChevronDown size={10} />
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  className="w-7 h-7 rounded bg-[#1A1A2E] text-white flex items-center justify-center hover:bg-slate-800 transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
            <div className="h-2" /> {/* Bottom spacing for rounded corner */}
          </div>
        </div>
      </div>

      {/* Sparkle decorative element attached to phone */}
      <div className="absolute -top-6 -right-6 text-amber-400 animate-pulse">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0L14 10L24 12L14 14L12 24L10 14L0 12L10 10L12 0Z" fill="currentColor" />
        </svg>
      </div>
    </motion.div>
  );
}
