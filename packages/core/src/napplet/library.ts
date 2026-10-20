import * as v from "valibot";
import type { RelayUrl } from "../relay/relay-connection";

/**
 * インストールしたアップレットと、役割（archetype）ごとの開く先の既定。アカウントに
 * 保存する（kind:30078、`d=moe.eyemono.streets/applets`）。
 *
 * デッキと同じ `d` タグに入れない。古い版の Streets はデッキを保存し直すとき、
 * 知らない欄を落とす。
 */
export const APPLET_LIBRARY_IDENTIFIER = "moe.eyemono.streets/applets";

export const appletLibraryStorageKey = (pubkey: string): string =>
  `streets.v1.applets.${pubkey}`;

/** アップレットの住所。名前付き（kind:35129）だけをインストールできる。 */
export type AppletAddress = { pubkey: string; identifier: string };

export type InstalledApplet = AppletAddress & {
  /** 見つけたリレー。作者の書き込み先に無くても、ここで引ける。 */
  relays?: RelayUrl[];
  installedAt: number;
};

/** 役割の開く先。`streets` は Streets のカラムで開く。 */
export type IntentTarget =
  | { type: "streets" }
  | ({ type: "applet" } & AppletAddress);

export type AppletLibrary = {
  version: 1;
  installed: InstalledApplet[];
  defaults: Record<string, IntentTarget>;
};

export const emptyAppletLibrary = (): AppletLibrary => ({
  version: 1,
  installed: [],
  defaults: {},
});

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));
const address = { pubkey: hex64, identifier: v.string() };

const librarySchema = v.object({
  version: v.literal(1),
  installed: v.array(
    v.object({
      ...address,
      relays: v.optional(v.array(v.string())),
      installedAt: v.number(),
    }),
  ),
  defaults: v.record(
    v.string(),
    v.variant("type", [
      v.object({ type: v.literal("streets") }),
      v.object({ type: v.literal("applet"), ...address }),
    ]),
  ),
});

export const parseAppletLibrary = (raw: string): AppletLibrary | undefined => {
  try {
    const parsed = v.safeParse(librarySchema, JSON.parse(raw));
    return parsed.success
      ? { ...parsed.output, installed: [...parsed.output.installed] }
      : undefined;
  } catch {
    return undefined;
  }
};

export const serializeAppletLibrary = (library: AppletLibrary): string =>
  JSON.stringify(library);

export const sameApplet = (a: AppletAddress, b: AppletAddress): boolean =>
  a.pubkey === b.pubkey && a.identifier === b.identifier;

export const isInstalled = (
  library: AppletLibrary,
  applet: AppletAddress,
): boolean => library.installed.some((item) => sameApplet(item, applet));

/** 新しく入れたものを先頭に置く。入っているものは、見つけたリレーだけを足す。 */
export const installApplet = (
  library: AppletLibrary,
  applet: AppletAddress & { relays?: readonly RelayUrl[] },
  now: number,
): AppletLibrary => {
  const relays = applet.relays?.length ? [...applet.relays] : undefined;
  const known = library.installed.find((item) => sameApplet(item, applet));
  if (known) {
    const merged = [...new Set([...(known.relays ?? []), ...(relays ?? [])])];
    if (merged.length === (known.relays?.length ?? 0)) return library;
    return {
      ...library,
      installed: library.installed.map((item) =>
        item === known ? { ...item, relays: merged } : item,
      ),
    };
  }
  return {
    ...library,
    installed: [
      {
        pubkey: applet.pubkey,
        identifier: applet.identifier,
        ...(relays ? { relays } : {}),
        installedAt: now,
      },
      ...library.installed,
    ],
  };
};

/** 外したものを既定にしていた役割は、既定を消して毎回たずねる形に戻す。 */
export const uninstallApplet = (
  library: AppletLibrary,
  applet: AppletAddress,
): AppletLibrary => {
  if (!isInstalled(library, applet)) return library;
  return {
    ...library,
    installed: library.installed.filter((item) => !sameApplet(item, applet)),
    defaults: Object.fromEntries(
      Object.entries(library.defaults).filter(
        ([, target]) =>
          !(target.type === "applet" && sameApplet(target, applet)),
      ),
    ),
  };
};

export const setIntentDefault = (
  library: AppletLibrary,
  archetype: string,
  target: IntentTarget | undefined,
): AppletLibrary => {
  const { [archetype]: _, ...rest } = library.defaults;
  return {
    ...library,
    defaults: target ? { ...rest, [archetype]: target } : rest,
  };
};
