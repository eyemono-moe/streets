import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import {
  MUTE_KIND,
  type MuteEntry,
  type MuteVisibility,
  PrivateMuteUnavailableError,
  changeMuteList,
  decodeMuteList,
  matchingMutes,
} from "../../core/moderation/mute-list";
import type { MuteTarget } from "../../core/nostr/build/mute";
import type { NostrEvent } from "../../core/nostr/event";
import type {
  EventStore,
  ReplaceableChange,
} from "../../core/read/event-store";
import type { Signer } from "../../core/signer/signer";
import type { Writer } from "../../core/write/writer";

export type MuteListState =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | { phase: "error" }
  | {
      phase: "missing" | "ready";
      entries: readonly MuteEntry[];
      privatePart: "ready" | "unavailable" | "invalid";
    };

export type MuteList = {
  state: Accessor<MuteListState>;
  saving: Accessor<boolean>;
  error: Accessor<string | undefined>;
  refresh(): Promise<void>;
  matches(event: NostrEvent): readonly MuteEntry[];
  add(target: MuteTarget, visibility: MuteVisibility): Promise<void>;
  remove(entry: MuteEntry): Promise<void>;
  move(entry: MuteEntry, to: MuteVisibility): Promise<void>;
};

type MuteStore = Pick<EventStore, "latestReplaceable" | "onReplaceableChanged">;

export const createMuteList = (options: {
  pubkey: Accessor<string | undefined>;
  signer: Signer;
  store: MuteStore;
  writer: Pick<Writer, "replace">;
  fetchLatest(
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ): Promise<NostrEvent | undefined>;
}): MuteList => {
  const [state, setState] = createSignal<MuteListState>({
    phase: "signed-out",
  });
  const [savingCount, setSavingCount] = createSignal(0);
  const [error, setError] = createSignal<string>();
  let generation = 0;
  let decodeRevision = 0;
  let queue = Promise.resolve();

  const decodeCurrent = async (author: string, expected: number) => {
    const revision = ++decodeRevision;
    const event = options.store.latestReplaceable(MUTE_KIND, author);
    const decoded = await decodeMuteList(event, options.signer, author);
    if (
      generation !== expected ||
      decodeRevision !== revision ||
      options.pubkey() !== author
    ) {
      return;
    }
    setState({
      phase: event ? "ready" : "missing",
      entries: decoded.entries,
      privatePart: decoded.privatePart,
    });
  };

  const load = async (author: string): Promise<void> => {
    const expected = ++generation;
    setError(undefined);
    setState({ phase: "loading" });
    try {
      await options.fetchLatest(MUTE_KIND, undefined, author);
      await decodeCurrent(author, expected);
    } catch {
      if (generation !== expected || options.pubkey() !== author) return;
      setState({ phase: "error" });
      setError(
        "ミュートリストを取得できませんでした。接続を確認して再試行してください",
      );
    }
  };

  createEffect(() => {
    const author = options.pubkey();
    if (!author) {
      generation += 1;
      setError(undefined);
      setState({ phase: "signed-out" });
      return;
    }
    void load(author);
  });

  const offChanged = options.store.onReplaceableChanged(
    (change: ReplaceableChange) => {
      const author = options.pubkey();
      if (change.kind !== MUTE_KIND || change.pubkey !== author || !author) {
        return;
      }
      void decodeCurrent(author, generation);
    },
  );
  onCleanup(offChanged);

  const run = (change: Parameters<typeof changeMuteList>[2]): Promise<void> => {
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const author = options.pubkey();
        if (!author)
          throw new Error("ミュートを保存するにはログインしてください");
        setSavingCount((value) => value + 1);
        setError(undefined);
        try {
          await options.writer.replace(
            MUTE_KIND,
            undefined,
            changeMuteList(options.signer, author, change),
          );
        } catch (cause) {
          const message =
            cause instanceof PrivateMuteUnavailableError
              ? "非公開ミュートには NIP-44 対応と署名器の権限が必要です"
              : `ミュートを保存できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`;
          setError(message);
          throw cause;
        } finally {
          setSavingCount((value) => value - 1);
        }
      });
    queue = operation;
    return operation;
  };

  return {
    state,
    saving: () => savingCount() > 0,
    error,
    async refresh() {
      const author = options.pubkey();
      if (author) await load(author);
    },
    matches(event) {
      const current = state();
      return current.phase === "ready" || current.phase === "missing"
        ? matchingMutes(current.entries, event)
        : [];
    },
    add: (target, visibility) =>
      run({ type: "add", entry: { target, visibility } }),
    remove: (entry) => run({ type: "remove", entry }),
    move: (entry, to) => run({ type: "move", entry, to }),
  };
};

const MuteListContext = createContext<MuteList>();

export const MuteListProvider: ParentComponent<{ value: MuteList }> = (
  props,
) => (
  <MuteListContext.Provider value={props.value}>
    {props.children}
  </MuteListContext.Provider>
);

export const useMuteList = (): MuteList => {
  const muteList = useContext(MuteListContext);
  if (!muteList) throw new Error("MuteListProvider の内側で使用してください");
  return muteList;
};

/** 独立した描画テストでは Provider を組まなくても通常表示へ戻せる。 */
export const useOptionalMuteList = (): MuteList | undefined =>
  useContext(MuteListContext);
