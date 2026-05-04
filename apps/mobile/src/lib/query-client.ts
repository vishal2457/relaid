import { QueryClient, QueryCache } from "@tanstack/react-query";
import { AxiosError } from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= 0 && __DEV__) return false;
        if (failureCount > 3) return false;

        if (error instanceof AxiosError && !error.response) {
          return false;
        }

        return !(
          error instanceof AxiosError &&
          [401, 403].includes(error.response?.status ?? 0)
        );
      },
      refetchOnWindowFocus: false,
      staleTime: 10 * 1000,
    },
    mutations: {
      onError: (error) => {
        console.log(error);
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          console.error("Session expired!");
        }
      }
    },
  }),
});
