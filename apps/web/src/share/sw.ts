import {
  SHARE_ACTION,
  SHARE_CACHE,
  SHARE_FAILED,
  SHARE_PARAM,
  shareInboxKey,
} from "./share-inbox-keys";

// Service Worker の型（WebWorker の lib）は、画面の DOM の lib と同じ tsconfig に並べられない。
// 使う分だけを書く。
type ExtendableEvent = Event & {
  waitUntil: (promise: Promise<unknown>) => void;
};
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
};
const sw = self as unknown as {
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
  location: Location;
  addEventListener: (
    type: "install" | "activate" | "fetch",
    listener: (event: FetchEvent) => void,
  ) => void;
};

sw.addEventListener("install", (event) => event.waitUntil(sw.skipWaiting()));
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));

/**
 * 送り直す先の画面の URL。受け口の URL に付いていた引数は残す。manifest の action には
 * 付けないが、開発や E2E で読み書き先を手元のリレーに絞る `?relays=` を落とさないため。
 */
const appUrl = (request: Request, value: string) => {
  const url = new URL("/", sw.location.origin);
  url.search = new URL(request.url).search;
  url.searchParams.set(SHARE_PARAM, value);
  return url.href;
};

/**
 * 届いた multipart をそのまま置き、アプリに読ませる。中身を開いて分けるのは
 * アプリの側にする（ここが欄の名前を知ると、manifest と 3 か所で揃える羽目になる）。
 */
const receive = async (request: Request): Promise<Response> => {
  try {
    const id = crypto.randomUUID();
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      shareInboxKey(id),
      new Response(await request.blob(), {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }),
    );
    return Response.redirect(appUrl(request, id), 303);
  } catch {
    return Response.redirect(appUrl(request, SHARE_FAILED), 303);
  }
};

// 共有の受け口のほかは何も受けない。オフライン用に画面を持つと、古い画面を配り続ける
// おそれを抱えることになる。
sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "POST") return;
  if (new URL(request.url).pathname !== SHARE_ACTION) return;
  event.respondWith(receive(request));
});
