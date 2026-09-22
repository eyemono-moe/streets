import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { ReadPlan } from "@streets/core/read/read-plan";
import {
  type RelayListEntry,
  parseRelayList,
} from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import {
  type RelayEditEvent,
  type RelayOp,
  allowsRelayOp,
  displayedRelays,
  emptyRelayEdit,
  relayEditTransition,
  relayOpsMutation,
} from "@streets/core/settings/relay-edit";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createMemo,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

const RELAY_LIST_KIND = 10002;

/**
 * 変えてから保存するまでの待ち。続けて足したり切り替えたりしている間はまとめる ——
 * 1 回ごとに署名を求めると、拡張機能の確認が操作のたびに出る。
 */
export const RELAY_SAVE_DELAY_MS = 800;

export type RelayEdit = {
  entries: Accessor<RelayListEntry[]>;
  loading: Accessor<boolean>;
  allows: (op: RelayOp) => boolean;
  statusOf: (url: RelayUrl) => RelayStatus;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
  /** 全カラム分の読み取り先。 */
  readPlan?: Accessor<ReadPlan>;
  /** フォロー中の人のリレー設定を探し終えたか。 */
  routingSettled?: Accessor<boolean>;
};

const RelayEditContext = createContext<RelayEdit>();

/**
 * リレーの設定を裁定する段。書きかけを持ち、少し待ってからまとめて保存する。
 * 設定のダイアログより外に置く —— ダイアログを閉じても、書きかけは保存まで運ぶ。
 */
export const RelayMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  relayList: Accessor<NostrEvent | undefined>;
  settled: Accessor<boolean>;
  statusOf: (url: RelayUrl) => RelayStatus;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
  readPlan?: Accessor<ReadPlan>;
  routingSettled?: Accessor<boolean>;
}> = (props) => {
  const [state, setState] = createStore(emptyRelayEdit());
  const apply = (event: RelayEditEvent) =>
    setState(reconcile(relayEditTransition(unwrap(state), event)));

  const saved = createMemo(() => {
    const event = props.relayList();
    return event ? parseRelayList(event) : [];
  });
  const entries = createMemo(() => displayedRelays(saved(), state));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, RELAY_SAVE_DELAY_MS);
  };

  const flush = () => {
    apply({ type: "relays/flush" });
    const sending = [...unwrap(state).saving];
    if (sending.length === 0) return;
    props.writer
      .replace(RELAY_LIST_KIND, undefined, relayOpsMutation(sending))
      .then(
        () => {
          apply({ type: "relays/saved" });
          notifySaved("リレーの設定を保存しました");
        },
        (cause) => {
          apply({ type: "relays/failed" });
          notifyError(cause, "リレーの設定を保存できませんでした");
        },
      )
      .finally(() => {
        // 送っている間に変えた分がある。
        if (unwrap(state).pending.length > 0) schedule();
      });
  };

  // ログアウトなどで段ごと消えるときも、書きかけは送っておく。
  onCleanup(() => {
    clearTimeout(timer);
    if (unwrap(state).pending.length > 0) flush();
  });

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "relays/edit":
        if (!allowsRelayOp(entries(), event.op)) return true;
        apply(event);
        schedule();
        return true;
      default:
        return false;
    }
  };

  const value: RelayEdit = {
    entries,
    loading: () => !props.settled() && props.relayList() === undefined,
    allows: (op) => allowsRelayOp(entries(), op),
    statusOf: props.statusOf,
    infoOf: props.infoOf,
    readPlan: props.readPlan,
    routingSettled: props.routingSettled,
  };

  return (
    <RelayEditContext.Provider value={value}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </RelayEditContext.Provider>
  );
};

export const useRelayEdit = (): RelayEdit | undefined =>
  useContext(RelayEditContext);
