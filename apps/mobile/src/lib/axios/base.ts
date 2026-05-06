import axios, { type AxiosRequestConfig } from "axios";
import { ToastAndroid, Platform } from "react-native";
import {
  invalidateSession,
  isUnauthorizedStatus,
} from "@/src/lib/pairing/auth";
import { getCurrentAccessToken } from "@/src/lib/pairing/session";

const DEFAULT_BASE_URL = "http://100.95.62.14:3001";

export let chatServerApiUrl = DEFAULT_BASE_URL;

const ERROR_TOAST_DEDUP_WINDOW_MS = 4000;
const recentErrorToasts = new Map<string, number>();

export type ApiRequestConfig = AxiosRequestConfig & {
  suppressErrorToast?: boolean;
};

const instance = axios.create({
  baseURL: `${chatServerApiUrl}/api`,
  timeout: 60000,
});

function shouldShowErrorToast(message: string) {
  const now = Date.now();
  const lastShownAt = recentErrorToasts.get(message) ?? 0;

  if (now - lastShownAt < ERROR_TOAST_DEDUP_WINDOW_MS) {
    return false;
  }

  recentErrorToasts.set(message, now);
  return true;
}

export function updateBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  chatServerApiUrl = trimmed;
  instance.defaults.baseURL = `${trimmed}/api`;
}

instance.interceptors.request.use(
  (config) => {
    const accessToken = getCurrentAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isUnauthorizedStatus(error.response?.status)) {
      console.error("Unauthorized: clearing pairing session");
      void invalidateSession();
    }

    const status = error.response?.status;
    const data = error.response?.data;
    const message =
      data?.error || data?.message || error.message || "An error occurred";

    console.error("API Error:", {
      url: error.config?.url,
      status,
      data,
      message,
      error: error.message,
    });

    const suppressErrorToast = Boolean(
      (error.config as ApiRequestConfig | undefined)?.suppressErrorToast,
    );

    if (
      Platform.OS === "android" &&
      !suppressErrorToast &&
      shouldShowErrorToast(message)
    ) {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    return Promise.reject(error);
  },
);

const baseApi = {
  get: <T>(url: string, config?: ApiRequestConfig) => {
    return instance.get<T>(url, config);
  },
  post: <T>(url: string, data?: any, config?: ApiRequestConfig) => {
    return instance.post<T>(url, data, config);
  },
  put: <T>(url: string, data?: any, config?: ApiRequestConfig) => {
    return instance.put<T>(url, data, config);
  },
  patch: <T>(url: string, data?: any, config?: ApiRequestConfig) => {
    return instance.patch<T>(url, data, config);
  },
  delete: <T>(url: string, config?: ApiRequestConfig) => {
    return instance.delete<T>(url, config);
  },
};

export default baseApi;
