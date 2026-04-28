import { Terminal, ArrowUpRight } from "lucide-react";
import { HeroContent } from "../components/HeroContent";
import { PhoneMockup } from "../components/PhoneMockup";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestRelease = {
  html_url: string;
  assets: ReleaseAsset[];
};

const latestReleaseUrl = "https://github.com/vishal2457/relaid/releases/latest";

async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/vishal2457/relaid/releases/latest",
      {
        next: { revalidate: 3600 },
        headers: {
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as LatestRelease;
    return release;
  } catch {
    return null;
  }
}

export default async function Home() {
  // We can use these for future version-specific downloads or info
  const latestRelease = await getLatestRelease();
  const releasePageUrl = latestRelease?.html_url ?? latestReleaseUrl;

  return (
    <div className="min-h-screen relative font-body selection:bg-ink selection:text-white">
      {/* Halftone patterned background */}
      <div className="halftone-bg" />


      {/* Navbar */}
      <nav className="relative z-10 flex justify-between items-center px-6 md:px-12 py-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A1A2E] flex items-center justify-center rounded-sm">
            <Terminal size={16} className="text-white" />
          </div>
          <span className="outfit text-2xl tracking-tighter uppercase">Relaid</span>
        </div>
        <a href="https://github.com/relaid" target="_blank" rel="noreferrer" className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1">
          GitHub <ArrowUpRight size={14} />
        </a>
      </nav>

      {/* Main Hero */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-12 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-8 items-center min-h-[calc(100vh-88px)]">
        <HeroContent />
        <PhoneMockup />
      </main>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
