import {
  type JSX,
  type ParentComponent,
  Show,
  createEffect,
  createSignal,
} from "solid-js";
import { defaultDeck } from "../core/deck/deck";
import {
  InvalidPrivateMuteListError,
  type MuteEntry,
  PrivateMuteUnavailableError,
  matchingMutes,
} from "../core/moderation/mute-list";
import type { RelayListEntry } from "../core/read/relay-list";
import { normalizeRelayUrl } from "../core/relay/relay-url";
import type { RelayListState } from "../core/settings/relay-list-state";
import type {
  Nip78Document,
  Nip78DocumentState,
} from "../core/solid/create-nip78-document";
import {
  type AccountProfileSettings,
  type AccountRelaySettings,
  type AccountSettings,
  AccountSettingsProvider,
  type ProfileInput,
} from "../routes/v1/account-settings";
import { type DeckStore, DeckStoreProvider } from "../routes/v1/deck-store";
import {
  type DeviceSettings,
  DeviceSettingsProvider,
} from "../routes/v1/device-settings";
import {
  type MuteList,
  MuteListProvider,
  type MuteListState,
} from "../routes/v1/mute-list";

export type RelaySettingsScene =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | {
      phase: "missing";
      entries?: readonly RelayListEntry[];
      dirty?: boolean;
      saving?: boolean;
      error?: string;
    }
  | {
      phase: "ready";
      entries?: readonly RelayListEntry[];
      dirty?: boolean;
      saving?: boolean;
      error?: string;
    };

export type MuteSettingsScene =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | { phase: "error"; error: string }
  | {
      phase: "missing";
      entries?: readonly MuteEntry[];
      privatePart?: "ready" | "unavailable" | "invalid";
      saving?: boolean;
      error?: string;
    }
  | {
      phase: "ready";
      entries?: readonly MuteEntry[];
      privatePart?: "ready" | "unavailable" | "invalid";
      saving?: boolean;
      error?: string;
    };

export type SettingsScene = {
  deck?: Nip78DocumentState;
  relays: RelaySettingsScene;
  mutes?: MuteSettingsScene;
  developerMode?: boolean;
};

const deckStoreFor = (
  scene: () => Nip78DocumentState | undefined,
): DeckStore => {
  const [state, setState] = createSignal<Nip78DocumentState>({
    phase: "ready",
    sync: "synced",
    remoteCreatedAt: 1_786_717_800,
  });
  const [value, setValue] = createSignal(defaultDeck("11".repeat(32)));

  createEffect(() => {
    setState(
      scene() ?? {
        phase: "ready",
        sync: "synced",
        remoteCreatedAt: 1_786_717_800,
      },
    );
  });

  return {
    value,
    state,
    update(change) {
      setValue(change);
      setState({ phase: "ready", sync: "pending" });
    },
    async refresh() {
      setState({ phase: "ready", sync: "synced" });
    },
    async keepLocal() {
      setState({ phase: "ready", sync: "synced" });
    },
    useRemote() {
      setState({ phase: "ready", sync: "synced" });
    },
  } satisfies Nip78Document<ReturnType<typeof defaultDeck>>;
};

const cloneRelays = (entries: readonly RelayListEntry[] | undefined) =>
  entries?.map((entry) => ({ ...entry })) ?? [];

const accountSettingsFor = (
  scene: () => RelaySettingsScene,
): AccountSettings => {
  const [phase, setPhase] = createSignal<RelayListState>({ phase: "loading" });
  const [saved, setSaved] = createSignal<RelayListEntry[]>([]);
  const [draft, setDraft] = createSignal<RelayListEntry[]>([]);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [profileDraft, setProfileDraft] = createSignal<ProfileInput>({
    display_name: "",
    name: "",
    about: "",
    website: "",
    nip05: "",
    picture: "",
    banner: "",
    lightningAddress: "",
  });
  const [profileDirty, setProfileDirty] = createSignal(false);

  createEffect(() => {
    const next = scene();
    if (next.phase === "signed-out" || next.phase === "loading") {
      setPhase({ phase: next.phase });
      setSaved([]);
      setDraft([]);
      setDirty(false);
      setSaving(false);
      setError(undefined);
      return;
    }
    const entries = cloneRelays(next.entries);
    setPhase(
      next.phase === "ready"
        ? { phase: "ready", entries: cloneRelays(entries) }
        : { phase: "missing" },
    );
    setSaved(cloneRelays(entries));
    setDraft(entries);
    setDirty(next.dirty ?? false);
    setSaving(next.saving ?? false);
    setError(next.error);
  });

  const changeDraft = (next: RelayListEntry[]) => {
    setDraft(next);
    setDirty(true);
    setError(undefined);
  };

  const relayList: AccountRelaySettings = {
    current: phase,
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
      if (next.some((entry, index) => entry !== draft()[index])) {
        changeDraft(next);
      }
    },
    remove(url) {
      if (saving()) return;
      changeDraft(draft().filter((entry) => entry.url !== url));
    },
    reset() {
      if (saving()) return;
      setDraft(cloneRelays(saved()));
      setDirty(false);
      setError(undefined);
    },
    async save() {
      if (saving() || !dirty()) return;
      if (draft().length === 0) {
        setError("リレーを 1 件以上追加してください");
        return;
      }
      setSaving(true);
      setSaved(cloneRelays(draft()));
      setPhase({ phase: "ready", entries: cloneRelays(draft()) });
      setDirty(false);
      setError(undefined);
      setSaving(false);
    },
  };

  const profile: AccountProfileSettings = {
    current: () => ({ phase: "ready", values: profileDraft() }),
    draft: profileDraft,
    dirty: profileDirty,
    saving: () => false,
    error: () => undefined,
    change(values) {
      setProfileDraft((current) => ({ ...current, ...values }));
      setProfileDirty(true);
    },
    reset() {
      setProfileDirty(false);
    },
    async save() {
      setProfileDirty(false);
    },
  };

  return { relayList, profile };
};

const muteListFor = (scene: () => MuteSettingsScene | undefined): MuteList => {
  const [state, setState] = createSignal<MuteListState>({
    phase: "signed-out",
  });
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();

  createEffect(() => {
    const next = scene();
    if (!next || next.phase === "signed-out" || next.phase === "loading") {
      setState({ phase: next?.phase ?? "signed-out" });
      setSaving(false);
      setError(undefined);
      return;
    }
    if (next.phase === "error") {
      setState({ phase: "error" });
      setSaving(false);
      setError(next.error);
      return;
    }
    setState({
      phase: next.phase,
      entries:
        next.entries?.map((entry) => ({
          target: { ...entry.target },
          visibility: entry.visibility,
        })) ?? [],
      privatePart: next.privatePart ?? "ready",
    });
    setSaving(next.saving ?? false);
    setError(next.error);
  });

  const changeEntries = (
    change: (entries: readonly MuteEntry[]) => MuteEntry[],
  ) => {
    const current = state();
    if (current.phase !== "ready" && current.phase !== "missing") return;
    setState({ ...current, entries: change(current.entries) });
    setError(undefined);
  };

  const privateFailure = (): "unavailable" | "invalid" | undefined => {
    const current = state();
    if (current.phase !== "ready" && current.phase !== "missing") return;
    return current.privatePart === "ready" ? undefined : current.privatePart;
  };

  const rejectPrivateChange = (
    failure: "unavailable" | "invalid",
  ): Promise<never> => {
    const cause =
      failure === "invalid"
        ? new InvalidPrivateMuteListError()
        : new PrivateMuteUnavailableError();
    setError(
      failure === "invalid"
        ? `ミュートを保存できませんでした: ${cause.message}`
        : "非公開ミュートには NIP-44 対応と署名器の権限が必要です",
    );
    return Promise.reject(cause);
  };

  return {
    state,
    saving,
    error,
    async refresh() {
      if (state().phase === "error") {
        setState({
          phase: "ready",
          entries: [],
          privatePart: "ready",
        });
        setError(undefined);
      }
    },
    matches(event) {
      const current = state();
      return current.phase === "ready" || current.phase === "missing"
        ? matchingMutes(current.entries, event)
        : [];
    },
    async add(target, visibility) {
      const failure = visibility === "private" ? privateFailure() : undefined;
      if (failure) {
        return rejectPrivateChange(failure);
      }
      changeEntries((entries) => [...entries, { target, visibility }]);
    },
    async remove(entry) {
      const failure =
        entry.visibility === "private" ? privateFailure() : undefined;
      if (failure) {
        return rejectPrivateChange(failure);
      }
      changeEntries((entries) =>
        entries.filter((candidate) => candidate !== entry),
      );
    },
    async move(entry, to) {
      const failure =
        entry.visibility === "private" || to === "private"
          ? privateFailure()
          : undefined;
      if (failure) {
        return rejectPrivateChange(failure);
      }
      changeEntries((entries) =>
        entries.map((candidate) =>
          candidate === entry ? { ...candidate, visibility: to } : candidate,
        ),
      );
    },
  };
};

const deviceSettingsFor = (scene: () => SettingsScene): DeviceSettings => {
  const [developerMode, setDeveloperMode] = createSignal(false);
  createEffect(() => setDeveloperMode(scene().developerMode ?? false));
  return {
    developerMode,
    toggleDeveloperMode() {
      setDeveloperMode((value) => !value);
    },
  };
};

/**
 * Story が宣言した設定状態を本番と同じ三つの context へ変換する。
 * context の全メソッドと外部依存はこの module の内側へ隠す。
 */
export const SettingsSceneProvider: ParentComponent<{
  scene: SettingsScene;
}> = (props): JSX.Element => {
  const account = accountSettingsFor(() => props.scene.relays);
  const mutes = muteListFor(() => props.scene.mutes);
  const device = deviceSettingsFor(() => props.scene);
  const deck = deckStoreFor(() => props.scene.deck);

  const content = () => (
    <DeckStoreProvider value={deck}>
      <AccountSettingsProvider value={account}>
        <DeviceSettingsProvider value={device}>
          {props.children}
        </DeviceSettingsProvider>
      </AccountSettingsProvider>
    </DeckStoreProvider>
  );

  return (
    <Show when={props.scene.mutes} fallback={content()}>
      <MuteListProvider value={mutes}>{content()}</MuteListProvider>
    </Show>
  );
};
