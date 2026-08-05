import type { RelayUrl } from "../../core/relay/relay-connection";

/**
 * `?relays=<url1>,<url2>,...` を `warmUpRouting` の `indexers` /
 * `SubscriptionManager` の `fallbackRelays` へそのまま渡せる値に変換する
 * (`src/routes/v1-preview.tsx`)。debug ルートの `?budget=` (`parse-budget.ts`)
 * と同じ形。
 *
 * **これは e2e 専用の抜け道であり、既定の経路ではない。** `/v1-preview` は
 * 通常 `default-relays.ts` の `BOOTSTRAP_INDEXERS` / `FALLBACK_RELAYS` —
 * すなわちインターネット上の本物のリレー — へ接続する。**自分の鍵で
 * ログインして自分のタイムラインが出る**ことがこのスライスの目的であり、
 * ローカルリレーではそれを確かめられない。このクエリパラメータは、
 * ローカルリレー (docker compose) へ差し替えたい e2e のためだけに存在する。
 *
 * `undefined` を返すのは「上書きしない (既定に委ねる)」の合図。
 * `parseBudget` と同じ理由で、未指定 (`null`) と空文字はどちらも
 * 「指定なし」として扱う — カンマ区切りの中身が結局 0 件になる入力
 * (`?relays=` や `?relays=,,`) も同様に「指定なし」に丸める。
 */
export const parseRelays = (param: string | null): RelayUrl[] | undefined => {
  if (param === null) return undefined;

  const urls = param
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  return urls.length > 0 ? urls : undefined;
};
