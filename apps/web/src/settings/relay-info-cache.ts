import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { type RelayInfo, fetchRelayInfo } from "@streets/core/relay/relay-info";
import { type Accessor, createSignal } from "solid-js";

/**
 * リレーが自分について答えた内容。ページを開くたびに取り直さないよう、
 * 開いている間（タブを閉じるまで）覚えておく。答えなかったリレーも覚える。
 */
const cache = new Map<RelayUrl, Accessor<RelayInfo | undefined>>();

export const relayInfo = (url: RelayUrl): RelayInfo | undefined => {
  let info = cache.get(url);
  if (!info) {
    const [value, setValue] = createSignal<RelayInfo | undefined>();
    void fetchRelayInfo(url).then(setValue);
    info = value;
    cache.set(url, info);
  }
  return info();
};
