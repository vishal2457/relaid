import axiosInstance from "./axios-base";
import { TDerivedApiResponse } from "../models/common.model";
import { AxiosRequestConfig } from "axios";
export const appBaseApi = {
  get:  <T>(url: string, params?: any, config?: AxiosRequestConfig) => {
    return axiosInstance.get<TDerivedApiResponse<T>>(url, { params, ...config });
  },
  post:  <T>(url: string, payload: any, config?: AxiosRequestConfig) => {
    return axiosInstance.post<TDerivedApiResponse<T>>(url, payload, config);
  },
  put:  <T>(url: string, payload: any) => {
    return axiosInstance.put<TDerivedApiResponse<T>>(url, payload);
  },
  delete:  <T>(url: string) => {
    return axiosInstance.delete<TDerivedApiResponse<T>>(url);
  },
};
