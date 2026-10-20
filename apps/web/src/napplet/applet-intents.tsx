import { buildNappletColumn } from "@streets/core/deck/column-presets";
import { installedAppletsSource } from "@streets/core/deck/column-sources";
import type { ColumnDef } from "@streets/core/deck/deck";
import { intentForColumn } from "@streets/core/deck/intent-columns";
import {
  type IntentDelivery,
  type IntentHandler,
  STREETS_HANDLER_ID,
  intentCatalog,
} from "@streets/core/napplet/intent";
import {
  type AppletAddress,
  type AppletLibrary,
  sameApplet,
} from "@streets/core/napplet/library";
import {
  NAPPLET_NAMED_KIND,
  type NappletManifest,
  parseNappletManifest,
} from "@streets/core/napplet/manifest";
import type { NappletSession } from "@streets/core/napplet/session";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ComposeTarget } from "@streets/core/view/compose-drafts";
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  useContext,
} from "solid-js";
import { subscribeThroughReadLayer } from "./streets-host";

/** 開くカラムと、アップレットで開くなら渡す依頼。`stack/open` にそのまま載せる。 */
export type Routed = { column: ColumnDef; delivery?: IntentDelivery };

export type AppletIntents = {
  /** インストール済みのアップレットと、届いたマニフェスト。 */
  installed: Accessor<{ applet: AppletAddress; manifest?: NappletManifest }[]>;
  /** 受け手の候補。インストール済みでマニフェストの届いたアップレットと、Streets。 */
  catalog: Accessor<IntentHandler[]>;
  /**
   * Streets の中で開こうとしたカラムを、既定のアップレットに回す。既定がアップレットで
   * なければ、そのまま返す。
   */
  route: (column: ColumnDef) => Routed;
  /**
   * Streets のカラムで開くはずのものを、受け付けるインストール済みのアップレットの一覧に
   * する。投稿のメニューの「○○ で開く」に使う。
   */
  handlersFor: (column: ColumnDef) => { id: string; title: string }[];
  /**
   * Streets の返信・引用を、投稿欄の既定のアップレット（`napplet:composer/open`）で
   * 開く。既定がアップレットでなければ undefined（Streets のダイアログで書く）。
   */
  routeCompose: (target: ComposeTarget) => Routed | undefined;
  /** `handlersFor` の 1 つで開くカラムと、渡す依頼。 */
  openIn: (handlerId: string, column: ColumnDef) => Routed | undefined;
  /**
   * 動いているアップレット（NAP-INC の endpoint）を登録する。id は動いている間だけ
   * 使い、同じアップレットを 2 つ開いても重ならない。外すときは返した関数を呼ぶ。
   */
  join: (session: Pick<NappletSession, "incEvent">) => {
    id: string;
    leave: () => void;
  };
  /** 話題で送る。送った本人には返さない。 */
  emit: (sender: string, topic: string, payload: unknown) => void;
};

const keyOf = (applet: AppletAddress) =>
  `${applet.pubkey}:${applet.identifier}`;

/** 依頼を受けたアップレットのカラム。id を住所から決めるので、預けた依頼を引ける。 */
export const appletColumnFor = (
  applet: AppletAddress & { relays?: readonly RelayUrl[] },
): ColumnDef =>
  buildNappletColumn(applet.pubkey, applet.identifier, applet.relays);

export const createAppletIntents = (options: {
  library: Accessor<AppletLibrary | undefined>;
  readLayer: Pick<ReadLayer, "manager" | "store">;
}): AppletIntents => {
  const installed = () => options.library()?.installed ?? [];
  const installedKey = createMemo(() => installed().map(keyOf).sort().join());
  const [manifests, setManifests] = createSignal<
    ReadonlyMap<string, NappletManifest>
  >(new Map());
  createEffect(
    on(installedKey, () => {
      const source = installedAppletsSource(installed());
      if (!source) return;
      const subscribe = subscribeThroughReadLayer(options.readLayer);
      const close = subscribe(
        source.filters,
        {
          event: (event: NostrEvent) => {
            if (event.kind !== NAPPLET_NAMED_KIND) return;
            const parsed = parseNappletManifest(event);
            if (!parsed.ok) return;
            const key = `${event.pubkey}:${parsed.manifest.identifier ?? ""}`;
            setManifests((current) => {
              const known = current.get(key);
              if (known && known.createdAt >= parsed.manifest.createdAt) {
                return current;
              }
              return new Map(current).set(key, parsed.manifest);
            });
          },
          eose: () => {},
        },
        source.extraRelays,
      );
      onCleanup(close);
    }),
  );
  const installedWithManifests = createMemo(() =>
    installed().map((applet) => ({
      applet: { pubkey: applet.pubkey, identifier: applet.identifier },
      manifest: manifests().get(keyOf(applet)),
    })),
  );
  const catalog = createMemo(() => intentCatalog(installedWithManifests()));

  const appletHandlers = (column: ColumnDef) => {
    const intent = intentForColumn(column);
    if (!intent) return [];
    return catalog().flatMap((item) =>
      item.type === "applet" &&
      item.archetypes.includes(intent.archetype) &&
      item.contracts.some((c) => c.convention === intent.convention)
        ? [item]
        : [],
    );
  };
  const openIn = (handlerId: string, column: ColumnDef): Routed | undefined => {
    const intent = intentForColumn(column);
    const handler = appletHandlers(column).find(
      (item) => item.id === handlerId,
    );
    if (!intent || !handler) return undefined;
    const known = installed().find((item) => sameApplet(item, handler.applet));
    const opened = appletColumnFor({
      ...handler.applet,
      relays: known?.relays,
    });
    return {
      column: opened,
      delivery: {
        sender: STREETS_HANDLER_ID,
        archetype: intent.archetype,
        action: intent.convention.split("/").at(-1) ?? "open",
        convention: intent.convention,
        payload: intent.payload,
      },
    };
  };
  const COMPOSER = "napplet:composer/open";
  const routeCompose = (target: ComposeTarget): Routed | undefined => {
    const preferred = options.library()?.defaults.composer;
    if (preferred?.type !== "applet") return undefined;
    const handler = catalog().find(
      (item) =>
        item.type === "applet" &&
        sameApplet(item.applet, preferred) &&
        item.archetypes.includes("composer") &&
        item.contracts.some((contract) => contract.convention === COMPOSER),
    );
    if (handler?.type !== "applet") return undefined;
    const known = installed().find((item) => sameApplet(item, handler.applet));
    const opened = appletColumnFor({
      ...handler.applet,
      relays: known?.relays,
    });
    return {
      column: opened,
      delivery: {
        sender: STREETS_HANDLER_ID,
        archetype: "composer",
        action: "open",
        convention: COMPOSER,
        // Composer・Chronofeed と同じ形（宛先は投稿そのもの）。
        payload: {
          content: "",
          [target.type === "reply" ? "replyTo" : "quote"]: target.event,
        },
      },
    };
  };
  const route = (column: ColumnDef): Routed => {
    const intent = intentForColumn(column);
    const target = intent && options.library()?.defaults[intent.archetype];
    if (target?.type !== "applet") return { column };
    const handler = appletHandlers(column).find((item) =>
      sameApplet(item.applet, target),
    );
    return (handler && openIn(handler.id, column)) ?? { column };
  };

  const endpoints = new Map<string, Pick<NappletSession, "incEvent">>();
  let joined = 0;
  const join = (session: Pick<NappletSession, "incEvent">) => {
    joined += 1;
    const id = `endpoint-${joined}`;
    endpoints.set(id, session);
    return { id, leave: () => endpoints.delete(id) };
  };
  const emit = (sender: string, topic: string, payload: unknown) => {
    for (const [id, session] of endpoints) {
      if (id === sender) continue;
      session.incEvent({
        topic,
        sender,
        ...(payload !== undefined ? { payload } : {}),
      });
    }
  };

  return {
    installed: installedWithManifests,
    join,
    emit,
    catalog,
    route,
    routeCompose,
    handlersFor: (column) =>
      appletHandlers(column).map((item) => ({
        id: item.id,
        title: item.title,
      })),
    openIn,
  };
};

const AppletIntentsContext = createContext<AppletIntents>();

export const AppletIntentsProvider = AppletIntentsContext.Provider;

/** デッキの外（Storybook など）では undefined。依頼を受け付けない。 */
export const useAppletIntents = (): AppletIntents | undefined =>
  useContext(AppletIntentsContext);
