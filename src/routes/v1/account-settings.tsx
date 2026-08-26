import {
  type Accessor,
  type ParentComponent,
  createComputed,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { setRelayList } from "../../core/nostr/build/relay-list";
import type {
  EventStore,
  ReplaceableChange,
} from "../../core/read/event-store";
import {
  type RelayListEntry,
  parseRelayList,
} from "../../core/read/relay-list";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { normalizeRelayUrl } from "../../core/relay/relay-url";
import type { RelayListState } from "../../core/settings/relay-list-state";
import type { Writer } from "../../core/write/writer";

const RELAY_LIST_KIND = 10002;

type RelayListStore = Pick<
  EventStore,
  "latestReplaceable" | "onReplaceableChanged"
>;

export type AccountRelaySettings = {
  current: Accessor<RelayListState>;
  draft: Accessor<readonly RelayListEntry[]>;
  dirty: Accessor<boolean>;
  saving: Accessor<boolean>;
  error: Accessor<string | undefined>;
  add(rawUrl: string): boolean;
  toggle(url: RelayUrl, direction: "read" | "write"): void;
  remove(url: RelayUrl): void;
  reset(): void;
  save(): Promise<void>;
};

export type AccountSettings = {
  relayList: AccountRelaySettings;
};

export type CreateAccountSettingsOptions = {
  pubkey: Accessor<string | undefined>;
  relayListSettled: Accessor<boolean>;
  store: RelayListStore;
  writer: Pick<Writer, "replace">;
};

const entriesFor = (state: RelayListState): RelayListEntry[] =>
  state.phase === "ready" ? state.entries.map((entry) => ({ ...entry })) : [];

/**
 * NIP-65 の取得状態、フォームの draft、Writer への保存を一つの interface に
 * 閉じる。Dialog は EventStore / Writer / kind:10002 のタグ形式を知らない。
 */
export const createAccountSettings = (
  options: CreateAccountSettingsOptions,
): AccountSettings => {
  const [version, setVersion] = createSignal(0);
  const [draft, setDraft] = createSignal<RelayListEntry[]>([]);
  const [draftRevision, setDraftRevision] = createSignal(0);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let previousPubkey: string | undefined;

  const current = createMemo<RelayListState>(() => {
    version();
    const pubkey = options.pubkey();
    if (!pubkey) return { phase: "signed-out" };
    if (!options.relayListSettled()) return { phase: "loading" };
    const event = options.store.latestReplaceable(RELAY_LIST_KIND, pubkey);
    return event
      ? { phase: "ready", entries: parseRelayList(event) }
      : { phase: "missing" };
  });

  createComputed(() => {
    const pubkey = options.pubkey();
    const state = current();
    if (pubkey !== previousPubkey) {
      previousPubkey = pubkey;
      setDraft(entriesFor(state));
      setDraftRevision((value) => value + 1);
      setDirty(false);
      setError(undefined);
      return;
    }
    if (!dirty()) setDraft(entriesFor(state));
  });

  const offChanged = options.store.onReplaceableChanged(
    (change: ReplaceableChange) => {
      if (
        change.kind === RELAY_LIST_KIND &&
        change.pubkey === options.pubkey()
      ) {
        setVersion((value) => value + 1);
      }
    },
  );
  onCleanup(offChanged);

  const changeDraft = (next: RelayListEntry[]) => {
    setDraft(next);
    setDraftRevision((value) => value + 1);
    setDirty(true);
    setError(undefined);
  };

  const relayList: AccountRelaySettings = {
    current,
    draft,
    dirty,
    saving,
    error,
    add(rawUrl) {
      if (saving()) return false;
      const url = normalizeRelayUrl(rawUrl.trim());
      if (!url) {
        setError("ws:// または wss:// で始まるリレー URL を入力してください");
        return false;
      }
      if (draft().some((entry) => entry.url === url)) {
        setError("このリレーは既に追加されています");
        return false;
      }
      changeDraft([...draft(), { url, read: true, write: true }]);
      return true;
    },
    toggle(url, direction) {
      if (saving()) return;
      const next = draft().map((entry) => {
        if (entry.url !== url) return entry;
        const toggled = { ...entry, [direction]: !entry[direction] };
        if (!toggled.read && !toggled.write) {
          setError(
            "read と write の少なくとも一方が必要です。不要なリレーは削除してください",
          );
          return entry;
        }
        return toggled;
      });
      if (
        next.some(
          (entry, index) =>
            entry.read !== draft()[index]?.read ||
            entry.write !== draft()[index]?.write,
        )
      ) {
        changeDraft(next);
      }
    },
    remove(url) {
      if (saving()) return;
      const next = draft().filter((entry) => entry.url !== url);
      if (next.length !== draft().length) changeDraft(next);
    },
    reset() {
      if (saving()) return;
      setDraft(entriesFor(current()));
      setDirty(false);
      setError(undefined);
    },
    async save() {
      if (saving() || !dirty()) return;
      const author = options.pubkey();
      if (!author) {
        setError("リレー設定を保存するにはログインしてください");
        return;
      }
      if (draft().length === 0) {
        setError("リレーを 1 件以上追加してください");
        return;
      }
      const revision = draftRevision();
      const entries = draft();
      setSaving(true);
      setError(undefined);
      try {
        const result = await options.writer.replace(
          RELAY_LIST_KIND,
          undefined,
          setRelayList(entries),
        );
        // 保存中にログアウトまたはアカウント切替が起き得る。
        // 旧アカウントの結果を新しい draft の状態へ反映しない。
        if (options.pubkey() !== author) return;
        if (result.rejected.length > 0) {
          setError(
            `リレー設定を ${result.rejected.length} 本へ保存できませんでした。接続を確認して再試行してください`,
          );
          return;
        }
        if (draftRevision() === revision) setDirty(false);
      } catch (cause) {
        if (options.pubkey() === author) {
          setError(
            `リレー設定を保存できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      } finally {
        setSaving(false);
      }
    },
  };

  return { relayList };
};

const AccountSettingsContext = createContext<AccountSettings>();

export const AccountSettingsProvider: ParentComponent<{
  value: AccountSettings;
}> = (props) => (
  <AccountSettingsContext.Provider value={props.value}>
    {props.children}
  </AccountSettingsContext.Provider>
);

export const useAccountSettings = (): AccountSettings => {
  const settings = useContext(AccountSettingsContext);
  if (!settings) {
    throw new Error("AccountSettingsProvider の内側で使用してください");
  }
  return settings;
};
