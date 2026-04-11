import { useState, useCallback } from "react";
import { AxiosError, AxiosResponse } from "axios";
import { TDerivedApiResponse } from "../../models/common.model";

interface MutationState<TData> {
  data: TData | null;
  error: Error | AxiosError | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
}

interface UseMutationResult<TData, TVariables> extends MutationState<TData> {
  mutate: (variables: TVariables) => Promise<AxiosResponse<TDerivedApiResponse<TData>, any>>;
  reset: () => void;
}

export function useMutation<TData = unknown, TVariables = unknown>(
  mutationFn: (variables: TVariables) => Promise<AxiosResponse<TDerivedApiResponse<TData>, any>>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error | AxiosError) => void;
  }
): UseMutationResult<TData, TVariables> {
  const [state, setState] = useState<MutationState<TData>>({
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
  });

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      isError: false,
      isSuccess: false,
    });
  }, []);

  const mutate = useCallback(
    async (variables: TVariables) => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        isError: false,
        isSuccess: false,
        error: null,
      }));

      try {
        const data = await mutationFn(variables);
        setState({
          data: data.data.result,
          error: null,
          isLoading: false,
          isError: false,
          isSuccess: true,
        });
        options?.onSuccess?.(data.data.result);
        return data;
      } catch (error) {
        setState({
          data: null,
          error: error as Error | AxiosError,
          isLoading: false,
          isError: true,
          isSuccess: false,
        });
        options?.onError?.(error as Error | AxiosError);
        throw error;
      }
    },
    [mutationFn, options]
  );

  return {
    ...state,
    mutate,
    reset,
  };
}
