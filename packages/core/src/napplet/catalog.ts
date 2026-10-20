import { appletHandlerId } from "./intent";
import { type AppletAddress, type AppletLibrary, sameApplet } from "./library";
/*
 * NAP-CATALOG（napplet/naps PR #95）。インストールしたアップレットの一覧を、読むだけで
 * 渡す。受け手の id は NAP-INTENT と同じもの（`appletHandlerId`）。
 *
 * > The shell MUST source the catalog from napplet manifests it has resolved and verified.
 * > A napplet catalog is a fingerprinting surface. The shell SHOULD expose only entries
 * > and metadata the caller needs.
 *
 * 公開されているもの全部ではなく、インストールしたものだけを渡す。
 */
import {
  INTENT_CONVENTION,
  NAPPLET_NAMED_KIND,
  type NappletManifest,
} from "./manifest";

export type CatalogSnapshot = {
  napplets: {
    id: string;
    identity: {
      kind: number;
      pubkey: string;
      eventId: string;
      dTag?: string;
      artifactHash: string;
    };
    title?: string;
    description: string;
    requires: string[];
    optional: string[];
    archetypes: {
      archetype: string;
      intents: { intent: string; convention: string; parameters: string[] }[];
    }[];
  }[];
  handlers: { archetype: string; currentHandler: string | null }[];
};

/**
 * `currentHandler` は、役割だけを名指しして頼まれたときに Streets が選ぶアップレット。
 * Streets のカラムで開く・選ばせるときは、一覧に無いので null にする。
 */
export const catalogSnapshot = (
  installed: readonly { applet: AppletAddress; manifest?: NappletManifest }[],
  library: AppletLibrary,
  /** Streets のカラムで開ける役割。 */
  streetsArchetypes: ReadonlySet<string>,
): CatalogSnapshot => {
  // > When a required field cannot be verified ..., it MUST omit the entire napplet entry.
  const verified = installed.flatMap(({ applet, manifest }) =>
    manifest && manifest.kind === NAPPLET_NAMED_KIND && manifest.identifier
      ? [{ applet, manifest, identifier: manifest.identifier }]
      : [],
  );
  const napplets = verified.map(({ applet, manifest, identifier }) => ({
    id: appletHandlerId(applet),
    identity: {
      kind: manifest.kind,
      pubkey: manifest.pubkey,
      eventId: manifest.eventId,
      dTag: identifier,
      artifactHash: manifest.artifactHash,
    },
    ...(manifest.title ? { title: manifest.title } : {}),
    description: manifest.description,
    requires: [...manifest.requires],
    optional: [...manifest.optional],
    // > Each intent is associated with the role matching its archetype segment on the same
    // > manifest ... roles with no matching intent have an empty `intents` list.
    archetypes: manifest.archetypes.map((archetype) => ({
      archetype,
      intents: manifest.intents.flatMap((contract) => {
        const match = INTENT_CONVENTION.exec(contract.convention);
        return match?.[1] === archetype
          ? [
              {
                intent: match[2] as string,
                convention: contract.convention,
                parameters: [...contract.params],
              },
            ]
          : [];
      }),
    })),
  }));
  const archetypes = [
    ...new Set(
      napplets.flatMap((entry) => entry.archetypes.map((a) => a.archetype)),
    ),
  ];
  const handlers = archetypes.map((archetype) => {
    const target = library.defaults[archetype];
    const candidates = verified.filter(({ manifest }) =>
      manifest.archetypes.includes(archetype),
    );
    const chosen =
      target?.type === "applet"
        ? candidates.find(({ applet }) => sameApplet(applet, target))
        : target === undefined &&
            candidates.length === 1 &&
            !streetsArchetypes.has(archetype)
          ? candidates[0]
          : undefined;
    return {
      archetype,
      currentHandler: chosen ? appletHandlerId(chosen.applet) : null,
    };
  });
  return { napplets, handlers };
};
