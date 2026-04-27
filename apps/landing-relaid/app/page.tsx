type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestRelease = {
  html_url: string;
  assets: ReleaseAsset[];
};

const latestReleaseUrl = "https://github.com/vishal2457/relaid/releases/latest";

const desktopAssets = [
  {
    key: "darwin-arm64",
    label: "Download for Apple Silicon",
    description: "macOS on M-series chips",
  },
  {
    key: "darwin-amd64",
    label: "Download for Intel Mac",
    description: "macOS on Intel",
  },
  {
    key: "linux-amd64",
    label: "Download for Linux",
    description: "Linux x64",
  },
] as const;

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

function getAssetUrl(release: LatestRelease | null, key: string) {
  const asset = release?.assets.find((item) =>
    item.name.includes(`relaid-desktop-${key}-v`),
  );

  return asset?.browser_download_url ?? latestReleaseUrl;
}

export default async function Home() {
  const latestRelease = await getLatestRelease();
  const releasePageUrl = latestRelease?.html_url ?? latestReleaseUrl;

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-[#07111f] text-white">
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(99,102,241,0.22),_transparent_28%),linear-gradient(180deg,_#0b1220_0%,_#07111f_45%,_#040814_100%)]" />
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-300">
                R
              </div>
              <span className="text-sm font-medium tracking-[0.22em] text-white/80 uppercase">
                Relaid
              </span>
            </div>
            <div className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 md:block">
              Mobile command center for AI agents
            </div>
          </div>

          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/8 px-4 py-2 text-sm text-cyan-100">
                Stay connected to Claude Code, Codex, and OpenCode from anywhere
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-balance sm:text-6xl lg:text-7xl">
                Your AI coding agents, on call from your phone.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                Relaid is a mobile command center for your AI coding agents.
                Run Claude Code, Codex, or OpenCode on your local machine and
                control them from anywhere. Your phone sends instructions through
                a relay server, streams back real-time output, and keeps you in
                the loop no matter where you are.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a
                  className="inline-flex min-h-14 items-center justify-center rounded-full bg-cyan-400 px-7 text-base font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-cyan-300"
                  href="#downloads"
                >
                  Download desktop app
                </a>
                <a
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/14 bg-white/6 px-7 text-base font-semibold text-white backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/10"
                  href={releasePageUrl}
                >
                  View latest release
                </a>
              </div>

              <div className="mt-10 grid gap-4 text-sm text-slate-300 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  Real-time terminal output
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  Secure relay between phone and local machine
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  Send prompts, monitor progress, stay in control
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl">
              <div className="absolute inset-x-10 top-10 -z-10 h-56 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative rounded-[2rem] border border-white/10 bg-white/6 p-3 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/90 p-4">
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-xs tracking-[0.24em] text-slate-400 uppercase">
                        Active relay
                      </p>
                      <p className="mt-1 text-sm font-medium text-white">
                        Mac Studio online
                      </p>
                    </div>
                    <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                      Live
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[1.5rem] border border-white/8 bg-[#08111d] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs tracking-[0.2em] text-slate-500 uppercase">
                            Agent session
                          </p>
                          <h2 className="mt-1 text-base font-semibold text-white">
                            OpenCode / refactor checkout flow
                          </h2>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <div>12:48 PM</div>
                          <div>Synced</div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3 rounded-2xl border border-white/8 bg-slate-900/80 p-4 font-mono text-sm text-slate-300">
                        <div className="text-cyan-300">$ pnpm check-types</div>
                        <div>Streaming terminal output to mobile...</div>
                        <div className="text-emerald-300">✓ 0 TypeScript errors</div>
                        <div className="text-slate-500">
                          Ready for next instruction
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-cyan-400/12 bg-cyan-400/8 p-4 text-sm text-cyan-50">
                        <p className="text-xs tracking-[0.18em] text-cyan-200 uppercase">
                          Sent from phone
                        </p>
                        <p className="mt-2 leading-6">
                          &quot;Run the build, summarize failures, and propose the
                          smallest fix.&quot;
                        </p>
                      </div>
                    </div>

                    <div className="mx-auto flex w-full max-w-[280px] items-center justify-center">
                      <div className="relative w-full rounded-[2.6rem] border border-white/12 bg-slate-950 p-3 shadow-2xl">
                        <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-white/12" />
                        <div className="overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,24,40,1)_0%,_rgba(7,13,23,1)_100%)] p-4">
                          <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>Relaid mobile</span>
                              <span>Agent live</span>
                            </div>
                            <div className="mt-3 rounded-2xl bg-cyan-400 px-3 py-3 text-sm font-medium text-slate-950">
                              Ask agent to continue from last output
                            </div>
                            <div className="mt-3 space-y-2 text-sm text-slate-300">
                              <div className="rounded-xl bg-white/5 px-3 py-2">
                                Relay connected
                              </div>
                              <div className="rounded-xl bg-white/5 px-3 py-2">
                                3 files changed
                              </div>
                              <div className="rounded-xl bg-white/5 px-3 py-2">
                                Build status: passing
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 pb-16 sm:px-10 lg:grid-cols-3 lg:px-12 lg:pb-24">
        <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.04] p-6 backdrop-blur-sm">
          <p className="text-sm font-medium text-cyan-200">Run locally</p>
          <p className="mt-3 text-base leading-7 text-slate-300">
            Keep Claude Code, Codex, or OpenCode on your own machine where your
            repo, tools, and credentials already live.
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.04] p-6 backdrop-blur-sm">
          <p className="text-sm font-medium text-cyan-200">Control remotely</p>
          <p className="mt-3 text-base leading-7 text-slate-300">
            Send fresh instructions from your phone when you are away from your
            desk and need the agent to keep moving.
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.04] p-6 backdrop-blur-sm">
          <p className="text-sm font-medium text-cyan-200">Stay informed</p>
          <p className="mt-3 text-base leading-7 text-slate-300">
            Watch logs stream back in real time, spot issues early, and respond
            before work stalls.
          </p>
        </div>
      </section>

      <section
        id="downloads"
        className="mx-auto w-full max-w-7xl px-6 pb-24 sm:px-10 lg:px-12"
      >
        <div className="flex flex-col items-start justify-between gap-8 rounded-[2rem] border border-cyan-400/12 bg-[linear-gradient(135deg,_rgba(34,211,238,0.14),_rgba(255,255,255,0.04))] p-8 sm:p-10 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-medium tracking-[0.2em] text-cyan-200 uppercase">
              Downloads
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Keep your agents running, even when you are not at your desk.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Install the desktop app to host your agent sessions locally, then
              pair it with the mobile app to send prompts and monitor progress
              from anywhere.
            </p>
          </div>
          <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
            {desktopAssets.map((asset) => (
              <a
                key={asset.key}
                className="flex min-h-24 flex-col justify-center rounded-[1.5rem] border border-white/14 bg-white px-6 py-4 text-slate-950 transition-colors hover:bg-slate-100"
                href={getAssetUrl(latestRelease, asset.key)}
              >
                <span className="text-base font-semibold">{asset.label}</span>
                <span className="mt-1 text-sm text-slate-600">
                  {asset.description}
                </span>
              </a>
            ))}
            <a
              className="flex min-h-24 flex-col justify-center rounded-[1.5rem] border border-white/14 bg-slate-950/40 px-6 py-4 text-white transition-colors hover:bg-slate-950/60"
              href={releasePageUrl}
            >
              <span className="text-base font-semibold">View all release assets</span>
              <span className="mt-1 text-sm text-slate-300">
                Open the latest GitHub release
              </span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
