import axios, { type AxiosRequestConfig } from "axios";
import { ToastAndroid, Platform } from "react-native";

const DEFAULT_BASE_URL = "http://100.95.62.14:3001";

export let chatServerApiUrl = DEFAULT_BASE_URL;
export const chatServerUserId =
  process.env.EXPO_PUBLIC_CHAT_USER_ID || "local-dev-user";

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
    config.headers["x-user-id"] = chatServerUserId;
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
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      "An error occurred";
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
