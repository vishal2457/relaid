const DEFAULT_DESKTOP_API_URL = "http://127.0.0.1:8080";

type WailsAppBridge = {
  go?: {
    main?: {
      App?: {
        GetServerBaseURL?: () => Promise<string>;
      };
    };
  };
};

let apiBaseUrl = import.meta.env.VITE_API_URL || DEFAULT_DESKTOP_API_URL;

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_DESKTOP_API_URL;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
};

export const initializeApiBaseUrl = async () => {
  if (import.meta.env.VITE_API_URL) {
    apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
    return apiBaseUrl;
  }

  const wailsApp = (window as Window & WailsAppBridge).go?.main?.App;
  if (!wailsApp?.GetServerBaseURL) {
    return apiBaseUrl;
  }

  try {
    const resolvedBaseUrl = await wailsApp.GetServerBaseURL();
    apiBaseUrl = normalizeApiBaseUrl(resolvedBaseUrl);
  } catch (error) {
    console.warn("Unable to resolve embedded server address", error);
  }

  return apiBaseUrl;
};

export const getApiBaseUrl = () => apiBaseUrl;
