import { useState, useCallback, useEffect } from "react";
import { AxiosError, AxiosResponse } from "axios";
import { TDerivedApiResponse } from "../../models/common.model";
interface QueryState<TData> {
  data: TData | null;
  error: Error | AxiosError | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
}

export interface UseQueryResult<TData> extends QueryState<TData> {
  fetchManually: (
    qf?: () => Promise<AxiosResponse<TDerivedApiResponse<TData>, any>>
  ) => void;
}

export function useQuery<TData = unknown>(
  queryFn?: () => Promise<AxiosResponse<TDerivedApiResponse<TData>, any>>,
  options?: {
    enabled?: boolean;
    select?: (data: TData) => TData;
    effect?: (data: TData) => void;
  }
): UseQueryResult<TData> {
  const [state, setState] = useState<QueryState<TData>>({
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
  });

  const fetchData = useCallback(
    async (
      qf?: () => Promise<AxiosResponse<TDerivedApiResponse<TData>, any>>
    ) => {
      const executeFn = qf || queryFn;
      if (!executeFn) return null;
      setState((prev) => ({
        ...prev,
        isLoading: true,
        isError: false,
        isSuccess: false,
        error: null,
      }));

      try {
        const data = await executeFn();
        setState({
          data: data.data.result,
          error: null,
          isLoading: false,
          isError: false,
          isSuccess: true,
        });
        options?.effect?.(data.data.result);
        return options?.select
          ? options.select(data.data.result)
          : data.data.result;
      } catch (error) {
        setState({
          data: null,
          error: error as Error | AxiosError,
          isLoading: false,
          isError: true,
          isSuccess: false,
        });
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (options?.enabled === false) return;
    fetchData();
  }, [options?.enabled, fetchData]);

  return {
    ...state,
    fetchManually: fetchData,
  };
}
