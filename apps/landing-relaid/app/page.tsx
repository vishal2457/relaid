import { HeroContent } from "../components/HeroContent";
import { PhoneMockup } from "../components/PhoneMockup";
import Image from "next/image";

type DownloadLink = {
  label: string;
  detail: string;
  href: string;
};

const latestReleaseUrl = "https://github.com/vishal2457/relaid/releases/latest";

const desktopTargets = [
  {
    label: "Mac Silicon",
    detail: "Apple Silicon",
  },
  {
    label: "Mac Intel",
    detail: "Intel Mac",
  },
  {
    label: "Windows",
    detail: "Windows PC",
  },
  {
    label: "Linux",
    detail: "Linux",
  },
];

const desktopDownloads: DownloadLink[] = desktopTargets.map((target) => ({
  ...target,
  href: latestReleaseUrl,
}));

const androidDownload: DownloadLink = {
  label: "Android",
  detail: "APK",
  href: latestReleaseUrl,
};

export default function Home() {
  return (
    <div className="min-h-screen relative font-body selection:bg-ink selection:text-white">
      {/* Halftone patterned background */}
      <div className="halftone-bg" />

      {/* Navbar */}
      <nav className="relative z-10 flex justify-between items-center px-6 md:px-12 py-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-sm">
            <Image
              src="/relaid-logo.png"
              alt="Relaid Logo"
              width={24}
              height={24}
              className="rounded-sm"
              style={{ width: "24px", height: "24px" }}
            />
          </div>
          <span className="outfit text-2xl tracking-tighter uppercase">Relaid</span>
        </div>
      </nav>

      {/* Main Hero */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-12 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-8 items-center min-h-[calc(100vh-88px)]">
        <HeroContent
          androidDownload={androidDownload}
          desktopDownloads={desktopDownloads}
        />
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
