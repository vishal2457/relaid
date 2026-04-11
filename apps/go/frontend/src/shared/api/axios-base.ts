import axios from "axios";
import { AppStorage } from "../utils/storage";
import { toast } from "sonner";
import { getApiBaseUrl } from "../utils/runtime-config";

export const API_URL = getApiBaseUrl();

const axiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = AppStorage.getItem("AUTH_TOKEN");
    if (token) {
      config.headers["Authorization"] = `${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("Unauthorized: Redirecting to login...");
      AppStorage.clear();
      window.location.href = "/login";
      return;
    }
    toast.error(error.response?.data?.message || "An error occurred");
    return Promise.reject(error);
  },
);

export default axiosInstance;
