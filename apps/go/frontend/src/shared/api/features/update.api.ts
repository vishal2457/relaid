export interface UpdateStatus {
  isUpdateAvailable: boolean;
  downloadUrl: string;
  fileName: string;
  currentVersion: string;
  latestVersion: string;
  releaseTag: string;
  target: string;
  error?: string;
}

type WailsUpdaterApp = {
  CheckForUpdates: () => Promise<UpdateStatus>;
  DownloadAndInstallUpdate: (
    downloadUrl: string,
    fileName: string,
  ) => Promise<void>;
};

function getApp(): WailsUpdaterApp {
  const app = (window as Window & { go?: { main?: { App?: WailsUpdaterApp } } })
    .go?.main?.App;

  if (!app) {
    throw new Error("Wails App not initialized");
  }

  return app;
}

export const updateApi = {
  checkForUpdates: async () => {
    return getApp().CheckForUpdates();
  },
  downloadAndInstallUpdate: async (downloadUrl: string, fileName: string) => {
    return getApp().DownloadAndInstallUpdate(downloadUrl, fileName);
  },
};
