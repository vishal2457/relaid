export interface TDerivedApiResponse<T> {
  msg: string
  result: T
  status: string
  statusCode: number
}

export interface ListFilters {
  filters: string
  sort: string
  limit: number
  page: number
  fields: string
}
