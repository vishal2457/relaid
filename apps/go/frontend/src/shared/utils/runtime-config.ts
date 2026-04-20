const DEFAULT_DESKTOP_API_URL = "http://127.0.0.1:8080";

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return DEFAULT_DESKTOP_API_URL;
};
