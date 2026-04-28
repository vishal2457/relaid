"use client";

import { motion } from "motion/react";
import { Download, Github } from "lucide-react";

export function HeroContent() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="lg:col-span-7 flex flex-col items-start gap-6"
    >

      <h1 className="outfit text-5xl sm:text-6xl lg:text-7xl leading-[0.9] text-[#1A1A2E]">
        Control your AI<br className="hidden lg:block" />agents from your phone.
      </h1>

      <p className="text-lg md:text-xl italic opacity-80 max-w-lg">
        No more being chained to your desk while Codex or OpenCode runs—monitor builds, approve commands, and view terminal output live from anywhere.
      </p>

      {/* 3 Step Flow */}
      <div className="relative flex flex-col gap-8 py-4">
        <div className="absolute left-[13px] top-6 bottom-6 w-[2px] step-line" />

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-[#1A1A2E] text-white outfit flex flex-shrink-0 items-center justify-center text-xs z-10">1</div>
          <span className="text-sm font-medium">Open the Relaid mobile app</span>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] outfit flex flex-shrink-0 items-center justify-center text-xs z-10">2</div>
          <span className="text-sm font-medium">Send commands & get live output</span>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-[#1A1A2E] text-white outfit flex flex-shrink-0 items-center justify-center text-xs z-10">3</div>
          <span className="text-sm font-medium leading-relaxed">
            Works with <span className="font-bold outfit px-1.5 py-0.5 bg-[#1A1A2E] text-white rounded mx-1 whitespace-nowrap">Codex</span>, <span className="font-bold outfit px-1.5 py-0.5 border border-[#1A1A2E] rounded mx-1 whitespace-nowrap">OpenCode</span>, & <span className="font-bold outfit px-1.5 py-0.5 bg-slate-200 text-[#1A1A2E] rounded mx-1 whitespace-nowrap">Claude Code</span>
          </span>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
        <button className="w-full sm:w-auto bg-[#1A1A2E] text-white outfit uppercase text-xs tracking-widest px-8 py-4 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
          <Download size={16} />
          Download App
        </button>
        <a href="https://github.com/relaid" className="w-full sm:w-auto border-2 border-[#1A1A2E] text-[#1A1A2E] outfit uppercase text-xs tracking-widest px-8 py-4 hover:bg-[#1A1A2E] hover:text-white transition-all flex items-center justify-center gap-2">
          <Github size={16} />
          View on GitHub
        </a>
      </div>
    </motion.div>
  );
}
