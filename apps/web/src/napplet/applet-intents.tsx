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
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
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

export type AppletIntents = {
  /** 受け手の候補。インストール済みでマニフェストの届いたアップレットと、Streets。 */
  catalog: Accessor<IntentHandler[]>;
  /** 依頼を受け手のカラムに預ける。カラムの id ごとに、開いたら取り出す。 */
  deliver: (columnId: string, delivery: IntentDelivery) => void;
  /** そのカラムに預けた依頼を取り出す。届くたびに `pending` が変わる。 */
  take: (columnId: string) => IntentDelivery[];
  pending: Accessor<number>;
  /**
   * Streets の中で開こうとしたカラムを、既定のアップレットに回す。既定がアップレットで
   * なければ、そのまま返す。
   */
  route: (column: ColumnDef) => ColumnDef;
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
  const catalog = createMemo(() =>
    intentCatalog(
      installed().map((applet) => ({
        applet,
        manifest: manifests().get(keyOf(applet)),
      })),
    ),
  );

  const queued = new Map<string, IntentDelivery[]>();
  const [pending, setPending] = createSignal(0);
  const deliver = (columnId: string, delivery: IntentDelivery) => {
    queued.set(columnId, [...(queued.get(columnId) ?? []), delivery]);
    setPending((count) => count + 1);
  };
  const take = (columnId: string) => {
    const deliveries = queued.get(columnId) ?? [];
    queued.delete(columnId);
    return deliveries;
  };

  const route = (column: ColumnDef): ColumnDef => {
    const intent = intentForColumn(column);
    const target = intent && options.library()?.defaults[intent.archetype];
    if (!intent || target?.type !== "applet") return column;
    const handler = catalog().find(
      (item) =>
        item.type === "applet" &&
        sameApplet(item.applet, target) &&
        item.contracts.some((c) => c.convention === intent.convention),
    );
    if (handler?.type !== "applet") return column;
    const known = installed().find((item) => sameApplet(item, target));
    const opened = appletColumnFor({ ...target, relays: known?.relays });
    deliver(opened.id, {
      sender: STREETS_HANDLER_ID,
      archetype: intent.archetype,
      action: "open",
      convention: intent.convention,
      payload: intent.payload,
    });
    return opened;
  };

  return { catalog, deliver, take, pending, route };
};

const AppletIntentsContext = createContext<AppletIntents>();

export const AppletIntentsProvider = AppletIntentsContext.Provider;

/** デッキの外（Storybook など）では undefined。依頼を受け付けない。 */
export const useAppletIntents = (): AppletIntents | undefined =>
  useContext(AppletIntentsContext);
