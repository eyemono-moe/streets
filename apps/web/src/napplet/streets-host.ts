import type { NappletManifest } from "@streets/core/napplet/manifest";
import { nappletScope } from "@streets/core/napplet/manifest";
import type {
  NappletHost,
  NappletProfile,
  NappletStorageScope,
  NappletTheme,
} from "@streets/core/napplet/session";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type {
  RelayFilter,
  RelayUrl,
} from "@streets/core/relay/relay-connection";
import type { RelayListState } from "@streets/core/settings/relay-list-state";

/** Streets が napplet に渡す機能。ここに無い機能（publish・intent など）はまだ渡さない。 */
export const STREETS_NAPPLET_DOMAINS = [
  "shell",
  "theme",
  "identity",
  "storage",
  "relay",
  "outbox",
] as const;

/** NAP-STORAGE が勧める、napplet 1 つあたりの保存の枠（UTF-8 のバイト数）。 */
export const NAPPLET_STORAGE_QUOTA = 512 * 1024;

const STORAGE_PREFIX = "streets.napplet.v1";

/** `outbox.resolveRelays` で 1 人につき返す書き込み先の数。読むときに選ぶ本数に揃える。 */
const NAPPLET_RESOLVED_RELAYS = 2;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * napplet の保存先。napplet ごと（`nappletScope`）と窓ごと（カラムの id）に分け、
 * 1 つの JSON にまとめて端末に置く。localStorage を使うのは、同期で読めて、
 * 閉じたあとも残るから（NAP-STORAGE は再読み込みを越えて残すことを求める）。
 */
export const createNappletStorage = (
  manifest: NappletManifest,
  instance: string,
  store: Store = localStorage,
): NappletHost["storage"] => {
  const keyOf = (scope: NappletStorageScope) =>
    scope === "shared"
      ? `${STORAGE_PREFIX}:${nappletScope(manifest)}`
      : `${STORAGE_PREFIX}:${nappletScope(manifest)}:${instance}`;
  const read = (scope: NappletStorageScope): Record<string, string> => {
    try {
      const parsed: unknown = JSON.parse(store.getItem(keyOf(scope)) ?? "{}");
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  };
  const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
  const write = (
    scope: NappletStorageScope,
    values: Record<string, string>,
  ) => {
    const text = JSON.stringify(values);
    const other =
      store.getItem(keyOf(scope === "shared" ? "instance" : "shared")) ?? "";
    if (bytes(text) + bytes(other) > NAPPLET_STORAGE_QUOTA) {
      throw new Error("quota exceeded");
    }
    store.setItem(keyOf(scope), text);
  };
  return {
    get: (scope, key) => read(scope)[key] ?? null,
    set: (scope, key, value) => write(scope, { ...read(scope), [key]: value }),
    remove: (scope, key) => {
      const { [key]: _, ...rest } = read(scope);
      if (Object.keys(rest).length === 0) store.removeItem(keyOf(scope));
      else write(scope, rest);
    },
    keys: (scope) => Object.keys(read(scope)),
  };
};

/**
 * napplet の購読を読み取り層へつなぐ。保存済みのものを出し終えたこと（EOSE）は、
 * 読み先に決まったリレーがすべて答えたか、繋がらなかったときに知らせる。
 */
export const subscribeThroughReadLayer =
  (readLayer: Pick<ReadLayer, "manager" | "store">) =>
  (
    filters: RelayFilter[],
    sink: {
      event: (event: NostrEvent, relay?: string) => void;
      eose: () => void;
    },
    hints: readonly string[] = [],
  ): (() => void) => {
    const answered = new Set<RelayUrl>();
    const seen = new Set<string>();
    let planned: readonly RelayUrl[] | undefined;
    let ended = false;
    const settle = () => {
      if (ended || planned === undefined) return;
      if (planned.every((relay) => answered.has(relay))) {
        ended = true;
        sink.eose();
      }
    };
    const handle = readLayer.manager.subscribe(
      filters,
      undefined,
      {
        onEvent: (id, relay) => {
          if (seen.has(id)) return;
          const event = readLayer.store.get(id);
          if (!event) return;
          seen.add(id);
          sink.event(event, relay);
        },
        onRelayComplete: (relay) => {
          answered.add(relay);
          settle();
        },
        onRelayUnreachable: (relay) => {
          answered.add(relay);
          settle();
        },
        onPlanChanged: (plan) => {
          planned = plan.relays;
          settle();
        },
        onRelayRestarted: (relay) => {
          if (!ended) answered.delete(relay);
        },
      },
      hints as RelayUrl[],
    );
    // 張り直しはまとめて後で走るので、最初の計画はたいてい空で、本当の読み先は
    // onPlanChanged で届く。空の計画を「全部答えた」とみなすと、何も届く前に EOSE になる。
    if (planned === undefined && handle.initialPlan.relays.length > 0) {
      planned = handle.initialPlan.relays;
      settle();
    }
    return () => handle.close();
  };

export const relayMap = (
  state: RelayListState,
): Record<string, { read: boolean; write: boolean }> =>
  state.phase === "ready"
    ? Object.fromEntries(
        state.entries.map((entry) => [
          entry.url,
          { read: entry.read, write: entry.write },
        ]),
      )
    : {};

export type StreetsHostInputs = {
  manifest: NappletManifest;
  /** 窓ごとの保存を分けるのに使う。カラムの id。 */
  instance: string;
  readLayer: Pick<ReadLayer, "manager" | "store">;
  viewer: () => string;
  relayList: () => RelayListState;
  profile: () => NappletProfile | null;
  follows: () => readonly string[];
  mutes: () => readonly string[];
  theme: () => NappletTheme;
};

export const createStreetsNappletHost = (
  inputs: StreetsHostInputs,
): NappletHost => ({
  domains: STREETS_NAPPLET_DOMAINS,
  publicKey: inputs.viewer,
  relays: () => relayMap(inputs.relayList()),
  profile: async () => inputs.profile(),
  follows: async () => inputs.follows(),
  mutes: async () => inputs.mutes(),
  theme: inputs.theme,
  storage: createNappletStorage(inputs.manifest, inputs.instance),
  subscribe: subscribeThroughReadLayer(inputs.readLayer),
  writeRelays: (pubkey) =>
    inputs.readLayer.manager.relaysForAuthor(pubkey, NAPPLET_RESOLVED_RELAYS),
});
