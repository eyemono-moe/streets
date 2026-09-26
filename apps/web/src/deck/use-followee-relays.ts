import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Accessor } from "solid-js";
import { useEventActions } from "../actions";
import { useOptionalReadLayer } from "../read-layer";

/**
 * フォローしている人ごとの、書き込みに使うリレー（リレーを足す欄の候補）。
 * リレーの設定（kind:10002）がまだ届いていない人は空になる。ログインしていない、
 * または読み取り層が無い場所では何も返さない。
 */
export const useFolloweeWriteRelays = (): Accessor<
  readonly (readonly RelayUrl[])[]
> => {
  const actions = useEventActions();
  const routing = useOptionalReadLayer()?.routing;
  return () =>
    actions && routing
      ? actions.followeeIds().map((pubkey) => routing.writeRelaysFor(pubkey))
      : [];
};
