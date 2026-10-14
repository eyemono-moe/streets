/**
 * ストーリーからリレーや外のサーバーへ繋がせない。ストーリーは固定の値を並べる
 * カタログで、外の答えで見た目が変わると、レビューする人ごとに違うものを見ることになる。
 * 黙って捨てると繋ごうとしたことに気づけないので、例外にして画面とログに出す。
 */
const isLocal = (target: string | URL): boolean => {
  try {
    const url = new URL(target, location.href);
    return (
      url.protocol === "data:" ||
      url.protocol === "blob:" ||
      url.hostname === location.hostname
    );
  } catch {
    return true;
  }
};

const refuse = (kind: string, target: string): Error => {
  const error = new Error(
    `Storybook からは外へ繋がない（${kind}: ${target}）。EventScene の relayInfo・nip05・linkCards などで答えを渡す。`,
  );
  console.error(error);
  return error;
};

export const guardOffline = () => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target =
      input instanceof Request ? input.url : (input as string | URL).toString();
    if (isLocal(target)) return realFetch(input, init);
    return Promise.reject(refuse("fetch", target));
  };

  const RealWebSocket = window.WebSocket;
  window.WebSocket = class extends RealWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      if (!isLocal(url)) throw refuse("WebSocket", url.toString());
      super(url, protocols);
    }
  };
};
