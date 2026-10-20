/*
 * NAP-INTENT（napplet/naps、2026-10）。アップレットが役割（archetype）と依頼（action）を
 * 名指しして、別のアップレットや Streets に開いてもらう。受け手はランチャーが決める。
 *
 * > The runtime MUST resolve an installed handler using manifest contracts and the
 * > user's default-handler preference.
 * > Handler resolution MUST match the requested stable convention by exact equality
 */
import { relayOf } from "../nostr/event-refs";
import type { AppletAddress, AppletLibrary, IntentTarget } from "./library";
import { sameApplet } from "./library";
import {
  INTENT_CONVENTION,
  NAPPLET_NAMED_KIND,
  type NappletManifest,
} from "./manifest";

export type IntentHandlerHint = { address: string; relays?: string[] };

export type IntentRequest = {
  archetype: string;
  action: string;
  convention: string;
  payload?: unknown;
  /** `default`・`choose`、または受け手の id。 */
  handler?: string;
  handlerHint?: IntentHandlerHint;
};

export type IntentResult =
  | {
      ok: true;
      archetype: string;
      action: string;
      convention: string;
      handler: string;
    }
  | { ok: false; error: string };

export type IntentDelivery = {
  sender: string;
  archetype: string;
  action: string;
  convention: string;
  payload?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_HINT_RELAYS = 4;

const HINT_ADDRESS = /^35129:([0-9a-f]{64}):([\s\S]+)$/;

/**
 * 届いた `intent.invoke` の `request` を確かめる。
 *
 * > The runtime MUST reject a normalized wire request when:
 * > - `convention` contains a query or fragment;
 * > - the convention archetype differs from `request.archetype`; or
 * > - the convention intent differs from `request.action`.
 */
export const parseIntentRequest = (
  raw: unknown,
): { ok: true; request: IntentRequest } | { ok: false; error: string } => {
  if (!isRecord(raw)) return { ok: false, error: "invalid convention" };
  const { archetype, action, convention, payload, handler, handlerHint } = raw;
  if (
    typeof archetype !== "string" ||
    typeof action !== "string" ||
    typeof convention !== "string"
  ) {
    return { ok: false, error: "invalid convention" };
  }
  const match = INTENT_CONVENTION.exec(convention);
  if (!match || match[1] !== archetype || match[2] !== action) {
    return { ok: false, error: "invalid convention" };
  }
  if (handler !== undefined && typeof handler !== "string") {
    return { ok: false, error: "invalid convention" };
  }
  let hint: IntentHandlerHint | undefined;
  if (handlerHint !== undefined) {
    if (
      !isRecord(handlerHint) ||
      typeof handlerHint.address !== "string" ||
      !HINT_ADDRESS.test(handlerHint.address)
    ) {
      return { ok: false, error: "invalid convention" };
    }
    // > Relay hints are untrusted discovery inputs and MUST NOT bypass the shell's network policy.
    // 読めない URL を落とし、明示の行き先として開きすぎないよう本数を絞る。
    const relays = Array.isArray(handlerHint.relays)
      ? handlerHint.relays
          .flatMap((relay) =>
            typeof relay === "string" ? (relayOf(relay) ?? []) : [],
          )
          .slice(0, MAX_HINT_RELAYS)
      : [];
    hint = {
      address: handlerHint.address,
      ...(relays.length > 0 ? { relays } : {}),
    };
  }
  return {
    ok: true,
    request: {
      archetype,
      action,
      convention,
      ...(payload !== undefined ? { payload } : {}),
      ...(typeof handler === "string" ? { handler } : {}),
      ...(hint ? { handlerHint: hint } : {}),
    },
  };
};

/** 勧められたアップレットの住所。 */
export const hintedApplet = (
  hint: IntentHandlerHint,
): AppletAddress | undefined => {
  const match = HINT_ADDRESS.exec(hint.address);
  return match
    ? { pubkey: match[1] as string, identifier: match[2] as string }
    : undefined;
};

export type IntentContract = { convention: string; params: string[] };

/** 受け手の候補。Streets のカラムか、インストールしたアップレット。 */
export type IntentHandler =
  | { type: "streets"; id: string; title: string; contracts: IntentContract[] }
  | {
      type: "applet";
      id: string;
      title: string;
      applet: AppletAddress;
      archetypes: string[];
      contracts: IntentContract[];
    };

export const STREETS_HANDLER_ID = "streets";

/** 名前付きの napplet の id。発行者・kind・`d` で決まり、版を上げても変わらない。 */
export const appletHandlerId = (applet: AppletAddress): string =>
  `${NAPPLET_NAMED_KIND}:${applet.pubkey}:${applet.identifier}`;

/**
 * Streets のカラムで開ける依頼。`params` は渡してほしい引数の名前（読むときは、ほかの
 * 名前も受け付ける）。
 */
export const STREETS_CONTRACTS: readonly IntentContract[] = [
  { convention: "napplet:profile/open", params: ["pubkey"] },
  { convention: "napplet:note/open", params: ["id"] },
  { convention: "napplet:article/open", params: ["naddr"] },
  { convention: "napplet:article/author", params: ["pubkey"] },
  {
    convention: "napplet:composer/open",
    params: ["content", "replyTo", "quote"],
  },
];

/**
 * インストール済みのアップレットと Streets を、依頼の受け手の一覧にする。マニフェストが
 * まだ届いていないアップレットは入れない（受け付ける依頼が分からない）。
 */
export const intentCatalog = (
  installed: readonly {
    applet: AppletAddress;
    manifest?: NappletManifest;
  }[],
): IntentHandler[] => [
  ...installed.flatMap(({ applet, manifest }): IntentHandler[] =>
    manifest
      ? [
          {
            type: "applet",
            id: appletHandlerId(applet),
            title: manifest.title ?? applet.identifier,
            // 既定として保存する形に揃える（インストールの記録の欄を持ち込まない）。
            applet: { pubkey: applet.pubkey, identifier: applet.identifier },
            archetypes: manifest.archetypes,
            contracts: manifest.intents,
          },
        ]
      : [],
  ),
  {
    type: "streets",
    id: STREETS_HANDLER_ID,
    title: "Streets",
    contracts: [...STREETS_CONTRACTS],
  },
];

/**
 * その役割として受け付ける依頼。
 *
 * > Its archetype segment MUST match a `z` value on the same manifest to be eligible
 * > for dispatch by that role.
 */
const contractsFor = (
  handler: IntentHandler,
  archetype: string,
): IntentContract[] =>
  handler.contracts.filter(
    (contract) =>
      INTENT_CONVENTION.exec(contract.convention)?.[1] === archetype &&
      (handler.type === "streets" || handler.archetypes.includes(archetype)),
  );

const isTarget = (handler: IntentHandler, target: IntentTarget | undefined) =>
  target !== undefined &&
  (target.type === "streets"
    ? handler.type === "streets"
    : handler.type === "applet" && sameApplet(handler.applet, target));

export type IntentCandidate = {
  id: string;
  title: string;
  actions: string[];
  conventions: string[];
  contracts: IntentContract[];
  isDefault: boolean;
};

export type IntentAvailability = {
  archetype: string;
  available: boolean;
  candidates: IntentCandidate[];
  hasDefault: boolean;
};

export const intentAvailability = (
  catalog: readonly IntentHandler[],
  library: AppletLibrary,
  archetype: string,
): IntentAvailability => {
  const target = library.defaults[archetype];
  const candidates = catalog.flatMap((handler): IntentCandidate[] => {
    const contracts = contractsFor(handler, archetype);
    if (contracts.length === 0) return [];
    return [
      {
        id: handler.id,
        title: handler.title,
        actions: [
          ...new Set(
            contracts.map(
              (contract) =>
                INTENT_CONVENTION.exec(contract.convention)?.[2] ?? "",
            ),
          ),
        ],
        conventions: [...new Set(contracts.map((c) => c.convention))],
        contracts,
        isDefault: isTarget(handler, target),
      },
    ];
  });
  return {
    archetype,
    available: candidates.length > 0,
    candidates,
    hasDefault: candidates.some((candidate) => candidate.isDefault),
  };
};

/** すべての役割の受け手。 */
export const intentHandlers = (
  catalog: readonly IntentHandler[],
  library: AppletLibrary,
): IntentAvailability[] => {
  const archetypes = new Set(
    catalog.flatMap((handler) =>
      handler.contracts.flatMap(
        (contract) => INTENT_CONVENTION.exec(contract.convention)?.[1] ?? [],
      ),
    ),
  );
  return [...archetypes]
    .map((archetype) => intentAvailability(catalog, library, archetype))
    .filter((availability) => availability.available);
};

export type IntentResolution =
  | { type: "error"; error: string }
  /** この受け手で開く。 */
  | { type: "open"; handler: IntentHandler }
  /**
   * ユーザーに選ばせる。`suggested` は勧められたが、まだインストールしていないアップレット。
   */
  | {
      type: "choose";
      candidates: IntentHandler[];
      suggested?: { applet: AppletAddress; relays: string[] };
    };

/**
 * 受け手を決める。
 *
 * > 1. An explicit authorized `handler` address or `handler: "choose"` selection.
 * > 2. The user's applicable default handler.
 * > 3. The recommended handler, if policy permits and it supports the requested
 * >    archetype, action, and convention.
 * > 4. Normal installed-handler resolution or user choice.
 *
 * 受け手を名指しできるのは、ユーザーがそれを許したときだけ（MUST）。Streets にはその許可の
 * 仕組みが無いので、名指しされたら選ばせる（Myco と同じ）。
 */
export const resolveIntent = (
  request: IntentRequest,
  catalog: readonly IntentHandler[],
  library: AppletLibrary,
): IntentResolution => {
  const candidates = catalog.filter((handler) =>
    contractsFor(handler, request.archetype).some(
      (contract) => contract.convention === request.convention,
    ),
  );
  const hinted = request.handlerHint && hintedApplet(request.handlerHint);
  const suggested =
    hinted &&
    !candidates.some(
      (handler) =>
        handler.type === "applet" && sameApplet(handler.applet, hinted),
    ) &&
    !library.installed.some((item) => sameApplet(item, hinted))
      ? { applet: hinted, relays: request.handlerHint?.relays ?? [] }
      : undefined;

  if (candidates.length === 0) {
    if (suggested) return { type: "choose", candidates, suggested };
    const roleKnown = catalog.some(
      (handler) => contractsFor(handler, request.archetype).length > 0,
    );
    return {
      type: "error",
      error: roleKnown ? "unsupported convention" : "no handler",
    };
  }
  if (request.handler !== undefined && request.handler !== "default") {
    return {
      type: "choose",
      candidates,
      ...(suggested ? { suggested } : {}),
    };
  }
  const preferred = candidates.find((handler) =>
    isTarget(handler, library.defaults[request.archetype]),
  );
  if (preferred) return { type: "open", handler: preferred };
  const recommended =
    hinted &&
    candidates.find(
      (handler) =>
        handler.type === "applet" && sameApplet(handler.applet, hinted),
    );
  if (recommended) return { type: "open", handler: recommended };
  if (candidates.length === 1 && !suggested) {
    return { type: "open", handler: candidates[0] as IntentHandler };
  }
  return { type: "choose", candidates, ...(suggested ? { suggested } : {}) };
};
