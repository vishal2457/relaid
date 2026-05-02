"use client";

import { motion } from "motion/react";
import { Download, Smartphone } from "lucide-react";

type DownloadLink = {
  label: string;
  detail: string;
  href: string;
};

type HeroContentProps = {
  androidDownload: DownloadLink;
  desktopDownloads: DownloadLink[];
};

function getPlatformInfo(): { isMobile: boolean; os: string } {
  if (typeof window === "undefined") return { isMobile: false, os: "unknown" };

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  let os = "unknown";
  if (/mac/i.test(navigator.platform)) {
    os = /mac/i.test(navigator.userAgent) && /intel/i.test(navigator.userAgent) ? "macIntel" : "macSilicon";
  } else if (/win/i.test(navigator.platform)) {
    os = "windows";
  } else if (/linux/i.test(navigator.platform)) {
    os = "linux";
  }

  return { isMobile, os };
}

function filterDesktopDownloads(downloads: DownloadLink[], os: string): DownloadLink[] {
  if (os === "macSilicon") {
    return downloads.filter((d) => d.label === "Mac Silicon");
  }
  if (os === "macIntel") {
    return downloads.filter((d) => d.label === "Mac Intel");
  }
  if (os === "windows") {
    return downloads.filter((d) => d.label === "Windows");
  }
  if (os === "linux") {
    return downloads.filter((d) => d.label === "Linux");
  }
  return downloads;
}

export function HeroContent({ androidDownload, desktopDownloads }: HeroContentProps) {
  const platform = getPlatformInfo();

  const filteredDesktop = platform.isMobile
    ? desktopDownloads.filter((d) => d.label === "Linux")
    : filterDesktopDownloads(desktopDownloads, platform.os);
  const showMobile = platform.isMobile;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="lg:col-span-7 flex flex-col items-start gap-6"
    >

      <h1 className="outfit text-5xl sm:text-6xl lg:text-7xl leading-[0.9] text-[#1A1A2E]">
        Keep your AI agents<br className="hidden lg:block" /> moving from anywhere.
      </h1>

      <p className="text-lg md:text-xl italic opacity-80 max-w-lg">
        Relaid puts your local coding agents on your phone: start sessions, watch output stream in real time, approve risky actions, and switch projects without sitting at your desk.
      </p>

      {/* 3 Step Flow */}
      <div className="relative flex flex-col gap-8 py-4">
        <div className="absolute left-[13px] top-6 bottom-6 w-[2px] step-line" />

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-[#1A1A2E] text-white outfit flex flex-shrink-0 items-center justify-center text-xs z-10">1</div>
          <span className="text-sm font-medium">Connect to the relay running on your machine</span>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] outfit flex flex-shrink-0 items-center justify-center text-xs z-10">2</div>
          <span className="text-sm font-medium">Pick a project, model, branch, and agent</span>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-[#1A1A2E] text-white outfit flex flex-shrink-0 items-center justify-center text-xs z-10">3</div>
          <span className="text-sm font-medium leading-relaxed">
            Send work to <span className="font-bold outfit px-1.5 py-0.5 bg-[#1A1A2E] text-white rounded mx-1 whitespace-nowrap">Codex</span>, <span className="font-bold outfit px-1.5 py-0.5 border border-[#1A1A2E] rounded mx-1 whitespace-nowrap">OpenCode</span>, or <span className="font-bold outfit px-1.5 py-0.5 bg-slate-200 text-[#1A1A2E] rounded mx-1 whitespace-nowrap">Claude Code</span>
          </span>
        </div>
      </div>

      {/* Desktop Downloads - always show */}
      <div className="flex flex-col gap-3 mt-8 w-full">
        <span className="text-xs font-bold outfit uppercase tracking-widest text-[#1A1A2E]/50">Download Desktop App</span>
        <div className="flex flex-wrap gap-2">
          {filteredDesktop.map((download) => (
            <a
              key={download.label}
              href={download.href}
              className="bg-white border border-[#1A1A2E]/20 text-[#1A1A2E] outfit uppercase tracking-widest text-[10px] font-bold px-4 py-2 hover:bg-[#1A1A2E] hover:text-white transition-all flex items-center justify-center gap-1.5 shadow-sm rounded-sm"
            >
              <Download size={14} />
              {download.label === "Mac Silicon"
                ? "Mac (Silicon)"
                : download.label === "Mac Intel"
                  ? "Mac (Intel)"
                  : download.label}
            </a>
          ))}
        </div>
      </div>

      {/* Mobile Download - only show on mobile */}
      {showMobile && (
        <div className="flex flex-col gap-3 w-full">
          <span className="text-xs font-bold outfit uppercase tracking-widest text-[#1A1A2E]/50">Download Mobile App</span>
          <a
            href={androidDownload.href}
            className="bg-white border border-[#1A1A2E]/20 text-[#1A1A2E] outfit uppercase tracking-widest text-[10px] font-bold px-4 py-2 hover:bg-[#1A1A2E] hover:text-white transition-all flex w-fit items-center justify-center gap-1.5 shadow-sm rounded-sm"
          >
            <Smartphone size={14} />
            Android App
          </a>
        </div>
      )}
    </motion.div>
  );
}
