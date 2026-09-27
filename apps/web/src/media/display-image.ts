import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import type { DownscaleReply, DownscaleRequest } from "./downscale.worker";

/**
 * 同時に縮める枚数。縮める間は原寸の画素を Worker が持つので、並べすぎると
 * 巨大な写真が重なったときに一時的にメモリが跳ねる。
 */
const MAX_IN_FLIGHT = 2;
/**
 * 覚えておく縮めた画像の数。仮想スクロールで行が作り直されるたびに縮め直さない
 * ため。1 枚は数十〜百数十 KB。
 */
const MAX_CACHED = 200;

type Entry = {
  /** 表示に使う URL。縮めたなら object URL、縮めないなら元の URL。 */
  src: Promise<string>;
  objectUrl?: string;
  settled: boolean;
  refs: number;
};

const cache = new Map<string, Entry>();
const replies = new Map<number, (blob: Blob | null) => void>();
const queue: Array<() => void> = [];
let inFlight = 0;
let nextId = 0;
/** `null` は Worker を作れなかった（以後は縮めずに元の URL を使う）。 */
let worker: Worker | null | undefined;

const failAll = () => {
  worker = null;
  for (const reply of replies.values()) reply(null);
  replies.clear();
};

const getWorker = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./downscale.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    worker = null;
    return worker;
  }
  worker.onmessage = (event: MessageEvent<DownscaleReply>) => {
    const reply = replies.get(event.data.id);
    replies.delete(event.data.id);
    reply?.(event.data.blob);
  };
  worker.onerror = failAll;
  return worker;
};

const pump = () => {
  while (inFlight < MAX_IN_FLIGHT) {
    const job = queue.shift();
    if (!job) return;
    job();
  }
};

/** 待ち行列に積み、順番が来たら Worker に頼む。順番が来たときに誰も待っていなければ取りやめる。 */
const downscale = (
  request: Omit<DownscaleRequest, "id">,
  wanted: () => boolean,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    queue.push(() => {
      const target = getWorker();
      if (!target || !wanted()) {
        resolve(null);
        return;
      }
      inFlight++;
      const id = nextId++;
      replies.set(id, (blob) => {
        inFlight--;
        resolve(blob);
        pump();
      });
      target.postMessage({ id, ...request } satisfies DownscaleRequest);
    });
    pump();
  });

/** 誰も使っていない古いものから捨てる。`Map` は入れた順に並ぶ。 */
const evict = () => {
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_CACHED) return;
    if (entry.refs > 0 || !entry.settled) continue;
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    cache.delete(key);
  }
};

const acquire = (url: string, maxEdge: number): Entry => {
  const key = `${maxEdge} ${url}`;
  const cached = cache.get(key);
  if (cached) {
    // 最近使ったものを後ろへ回す。
    cache.delete(key);
    cache.set(key, cached);
    cached.refs++;
    return cached;
  }
  const entry: Entry = { src: Promise.resolve(url), settled: false, refs: 1 };
  entry.src = downscale({ url, maxEdge }, () => entry.refs > 0).then((blob) => {
    entry.settled = true;
    if (!blob) {
      // 誰も待たずに取りやめたものは覚えない。次に表示するときに縮める。
      if (entry.refs === 0) cache.delete(key);
      return url;
    }
    entry.objectUrl = URL.createObjectURL(blob);
    return entry.objectUrl;
  });
  cache.set(key, entry);
  evict();
  return entry;
};

/**
 * 表示の大きさに縮めた画像の URL。縮め終えるまでは `undefined`。`active` が
 * true になるまで（画面に近づくまで）取りに行かない。縮められないもの（CORS を
 * 許していないホスト・動く画像・もともと小さい画像）は元の URL を返す。
 */
export const createDisplayImage = (
  url: Accessor<string | undefined>,
  maxEdge: number,
  active: Accessor<boolean> = () => true,
): Accessor<string | undefined> => {
  const [src, setSrc] = createSignal<string>();
  createEffect(
    on([url, active], ([current, ready]) => {
      setSrc(undefined);
      if (!current || !ready) return;
      if (!/^https?:/.test(current)) {
        setSrc(current);
        return;
      }
      const entry = acquire(current, maxEdge);
      let alive = true;
      void entry.src.then((resolved) => {
        if (alive) setSrc(resolved);
      });
      onCleanup(() => {
        alive = false;
        entry.refs--;
        evict();
      });
    }),
  );
  return src;
};

/**
 * 要素が画面に近づいたら true になり、以後は true のまま。`loading="lazy"` の
 * 代わりに、縮める仕事を画面に近いものから始めるのに使う。
 */
export const createNearViewport = (
  element: Accessor<Element | undefined>,
): Accessor<boolean> => {
  const [near, setNear] = createSignal(false);
  createEffect(() => {
    const target = element();
    if (!target || near()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // ブラウザの loading="lazy" と同じくらい手前から始める。
      { rootMargin: "1250px" },
    );
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });
  return near;
};
