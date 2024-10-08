import stringify from "safe-stable-stringify";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  createMemo,
  lazy,
  on,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { isDev } from "solid-js/web";
import type EventCacheDevToolsComp from "../components/devtools/EventCacheDevTools";

export type CacheKey = (string | number | boolean | undefined)[];

const hash = (key: CacheKey) => {
  return stringify(key);
};

export interface CacheDataBase<TData = unknown> {
  data: TData | undefined;
  dataUpdatedAt: number;
  isFetching: boolean;
  isInvalidated: boolean;
  staleTime?: number;
}

const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5min

const createCacheData = (): CacheDataBase => {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    isFetching: false,
    isInvalidated: true,
  };
};

const EventCacheContext = createContext<{
  get: <T>(
    props: Accessor<{ queryKey: CacheKey; emitter: () => void }>,
  ) => Accessor<CacheDataBase<T>>;
  set: <T, U = T>(
    queryKey: CacheKey,
    data: T | ((prev: U) => T),
    staleTime?: number,
  ) => void;
  invalidate: (queryKey: CacheKey) => void;
}>();

export const EventCacheProvider: ParentComponent = (props) => {
  const emitterMap = new Map<string, () => void>();

  // TODO: persist cache
  const [cacheStore, setCacheStore] = createStore<{
    [key: string]: CacheDataBase | undefined;
  }>();

  const get = <T,>(
    props: () => { queryKey: CacheKey; emitter: () => void },
  ) => {
    const key = () => hash(props().queryKey);

    const cache = createMemo(
      () => (cacheStore[key()] ?? createCacheData()) as CacheDataBase<T>,
    );

    createEffect(
      on([cache, props, key], ([cache, props, key]) => {
        emitterMap.set(key, props.emitter);
        if (cache.data) {
          if (cache.isInvalidated) {
            emit(props.queryKey);
            return;
          }

          if (cache.staleTime) {
            const elapsed = Date.now() - cache.dataUpdatedAt;
            // staleでなければcacheを返すだけ
            if (elapsed < cache?.staleTime) {
              return;
            }
            // staleならemitする
            emit(props.queryKey);
            return;
          }

          // staleTimeがない場合はcacheを返すだけ
          return;
        }
        // create new cache and emit
        setCacheStore(key, createCacheData());
        emit(props.queryKey);
      }),
    );

    return cache;
  };

  const emit = (queryKey: CacheKey) => {
    const key = hash(queryKey);
    const emitter = emitterMap.get(key);
    if (emitter) {
      setCacheStore(key, "isFetching", true);
      emitter();
    } else {
      console.error(`emitter is not found for ${key}`);
    }
  };

  const set = (
    queryKey: CacheKey,
    data: unknown | ((prev: unknown) => unknown),
    staleTime?: number,
  ) => {
    const key = hash(queryKey);
    setCacheStore(key, {
      data: typeof data === "function" ? data(cacheStore[key]?.data) : data,
      dataUpdatedAt: Date.now(),
      isFetching: false,
      isInvalidated: false,
      staleTime: staleTime ?? DEFAULT_STALE_TIME,
    });
  };

  const invalidate = (queryKey: CacheKey) => {
    const key = hash(queryKey);
    setCacheStore(key, "isInvalidated", true);
  };

  return (
    <EventCacheContext.Provider
      value={{
        get,
        set,
        invalidate,
      }}
    >
      {props.children}
      <EventCacheDevTools cache={cacheStore} />
    </EventCacheContext.Provider>
  );
};

const useEventCache = () => {
  const ctx = useContext(EventCacheContext);
  if (!ctx) {
    throw new Error("EventCacheProvider is not found");
  }
  return ctx;
};

export const createGetter = <T,>(
  props: () => {
    readonly queryKey: CacheKey;
    emitter: () => void;
  },
) => {
  const { get } = useEventCache();
  return get<T>(props);
};

export const eventCacheSetter = () => {
  const { set } = useEventCache();
  return set;
};

export const invalidateEventCache = (queryKey: CacheKey) => {
  const { invalidate } = useEventCache();
  invalidate(queryKey);
};

const EventCacheDevTools: typeof EventCacheDevToolsComp = isDev
  ? lazy(() => import("../components/devtools/EventCacheDevTools"))
  : () => null;
