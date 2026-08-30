export interface CacheDataBase<TData = unknown> {
  data: TData | undefined;
  dataUpdatedAt: number;
  isFetching: boolean;
  isInvalidated: boolean;
  staleTime?: number;
}
