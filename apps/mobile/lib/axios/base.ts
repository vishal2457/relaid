import axios, { type AxiosRequestConfig } from "axios";
import { ToastAndroid, Platform } from "react-native";
import { getCurrentAccessToken } from "@/lib/pairing/session";

const DEFAULT_BASE_URL = "http://100.95.62.14:3001";

export let chatServerApiUrl = DEFAULT_BASE_URL;

const instance = axios.create({
  baseURL: `${chatServerApiUrl}/api`,
  timeout: 60000,
});

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
    if (error.response?.status === 401) {
      console.error("Unauthorized: Redirecting to login...");
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

    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    return Promise.reject(error);
  },
);

const baseApi = {
  get: <T>(url: string, config?: AxiosRequestConfig) => {
    return instance.get<T>(url, config);
  },
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return instance.post<T>(url, data, config);
  },
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return instance.put<T>(url, data, config);
  },
  patch: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return instance.patch<T>(url, data, config);
  },
  delete: <T>(url: string, config?: AxiosRequestConfig) => {
    return instance.delete<T>(url, config);
  },
};

export default baseApi;
