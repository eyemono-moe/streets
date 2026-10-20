import { streetsIntentColumn } from "@streets/core/deck/intent-columns";
import { fetchNappletArtifact } from "@streets/core/napplet/artifact";
import {
  type IntentHandler,
  type IntentRequest,
  type IntentResult,
  STREETS_HANDLER_ID,
  appletHandlerId,
  intentAvailability,
  intentHandlers,
  resolveIntent,
} from "@streets/core/napplet/intent";
import {
  type AppletAddress,
  emptyAppletLibrary,
} from "@streets/core/napplet/library";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import type {
  NappletHost,
  NappletSession,
} from "@streets/core/napplet/session";
import { prepareNappletSrcdoc } from "@streets/core/napplet/srcdoc";
import {
  type Component,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
} from "solid-js";
import {
  appletColumnFor,
  useAppletIntents,
} from "../../napplet/applet-intents";
import { useAppletLibrary } from "../../napplet/applet-library";
import IntentSheet, { type IntentSheetProps } from "../../napplet/IntentSheet";
import NappletFrame from "../../napplet/NappletFrame";
import NappletView, { type NappletPhase } from "../../napplet/NappletView";
import {
  STREETS_NAPPLET_DOMAINS,
  createStreetsNappletHost,
} from "../../napplet/streets-host";
import { currentNappletTheme } from "../../napplet/theme-colors";
import { useProfile } from "../../note/use-profile";
import { useMutes } from "../../settings/MuteMediator";
import { useDispatch } from "../../ui-events";
import { useColumnScope } from "../column-scope";
import type { ColumnInputs } from "../column-views";
import { createNappletManifest } from "./napplet-manifest";

const SUPPORTED: ReadonlySet<string> = new Set(STREETS_NAPPLET_DOMAINS);

/** NIP-5D の名前付き napplet を、マニフェストを引いて本体を照合してから動かす。 */
const Napplet: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
  inputs: ColumnInputs;
}> = (props) => {
  const scope = useColumnScope();
  const { lookup, manifest } = createNappletManifest({
    pubkey: () => props.pubkey,
    identifier: () => props.identifier,
    relays: () => props.relays,
  });
  const [artifact] = createResource(manifest, (current) =>
    fetchNappletArtifact(
      current.artifactHash,
      current.servers,
      globalThis.fetch.bind(globalThis),
    ),
  );

  const state = (): NappletPhase => {
    const current = lookup();
    if (current.phase === "loading") return { phase: "manifest-loading" };
    if (current.phase === "missing") return { phase: "manifest-missing" };
    if (current.phase === "invalid") {
      return { phase: "manifest-invalid", error: current.error };
    }
    const result = artifact();
    if (artifact.loading || result === undefined) {
      return { phase: "artifact-loading" };
    }
    return result.ok
      ? { phase: "ready" }
      : { phase: "artifact-failed", error: result.error };
  };
  const unsupported = () =>
    manifest()?.requires.filter((domain) => !SUPPORTED.has(domain)) ?? [];

  const dispatch = useDispatch();
  const library = useAppletLibrary();
  const intents = useAppletIntents();
  const [session, setSession] = createSignal<NappletSession>();
  const [asking, setAsking] = createSignal<
    Omit<IntentSheetProps, "onPick" | "onInstall" | "onCancel"> & {
      answer: (
        picked:
          | { type: "handler"; id: string; always: boolean }
          | { type: "install"; always: boolean }
          | undefined,
      ) => void;
    }
  >();
  const self: AppletAddress = {
    pubkey: props.pubkey,
    identifier: props.identifier,
  };
  const catalog = () => intents?.catalog() ?? [];

  // 預けられた依頼は、napplet が動いていれば届ける（起動前なら session が待たせる）。
  createEffect(() => {
    intents?.pending();
    const current = session();
    if (!current || !intents) return;
    for (const delivery of intents.take(scope.column().id)) {
      current.deliver(delivery);
    }
  });
  // NAP-INTENT: > The runtime SHOULD emit `intent.changed` when catalog or default-handler
  // > state changes.
  createEffect(
    on(
      [catalog, () => library()?.defaults],
      () => {
        const current = session();
        if (!current) return;
        for (const availability of intentHandlers(
          catalog(),
          library() ?? emptyAppletLibrary(),
        )) {
          current.intentChanged(availability);
        }
      },
      { defer: true },
    ),
  );

  const openWith = (
    handler: IntentHandler | (AppletAddress & { type: "install" }),
    request: IntentRequest,
  ): IntentResult => {
    const accepted = {
      ok: true as const,
      archetype: request.archetype,
      action: request.action,
      convention: request.convention,
    };
    if (handler.type === "streets") {
      const column = streetsIntentColumn(request.convention, request.payload);
      if (!column) return { ok: false, error: "invoke rejected" };
      dispatch({ type: "stack/open", column, direct: true });
      return { ...accepted, handler: STREETS_HANDLER_ID };
    }
    const applet = handler.type === "applet" ? handler.applet : handler;
    const known = library()?.installed.find(
      (item) =>
        item.pubkey === applet.pubkey && item.identifier === applet.identifier,
    );
    const column = appletColumnFor({ ...applet, relays: known?.relays });
    intents?.deliver(column.id, {
      sender: appletHandlerId(self),
      archetype: request.archetype,
      action: request.action,
      convention: request.convention,
      ...(request.payload !== undefined ? { payload: request.payload } : {}),
    });
    dispatch({ type: "stack/open", column, direct: true });
    return { ...accepted, handler: appletHandlerId(applet) };
  };

  let activationWindow: Window | undefined;
  const intentHost = (sourceTitle: string): NappletHost["intent"] => ({
    available: (archetype) =>
      intentAvailability(
        catalog(),
        library() ?? emptyAppletLibrary(),
        archetype,
      ),
    handlers: () =>
      intentHandlers(catalog(), library() ?? emptyAppletLibrary()),
    invoke: async (request) => {
      if (!intents) return { ok: false, error: "no handler" };
      // 選ばせている間に重ねて頼ませない（Myco と同じく、待ってもらう）。
      if (asking()) return { ok: false, error: "busy: try again in a moment" };
      const current = library() ?? emptyAppletLibrary();
      const resolution = resolveIntent(request, catalog(), current);
      if (resolution.type === "error") {
        return { ok: false, error: resolution.error };
      }
      // NAP-INTENT: > Invocation may navigate, focus, start, or close napplet surfaces.
      // > The runtime SHOULD rate-limit or require a user gesture according to policy.
      // iframe の中で押すと、外側の窓も user activation を得る。
      const activated =
        activationWindow?.navigator.userActivation?.isActive ?? false;
      if (resolution.type === "open" && activated) {
        return openWith(resolution.handler, request);
      }
      const candidates =
        resolution.type === "open"
          ? [resolution.handler]
          : resolution.candidates;
      const picked = await new Promise<
        Parameters<NonNullable<ReturnType<typeof asking>>["answer"]>[0]
      >((answer) =>
        setAsking({
          source: sourceTitle,
          archetype: request.archetype,
          mode: resolution.type === "open" ? "confirm" : "choose",
          candidates: candidates.map((handler) => ({
            id: handler.id,
            title:
              handler.type === "streets" ? "Streets のカラム" : handler.title,
            streets: handler.type === "streets",
          })),
          ...(resolution.type === "choose" && resolution.suggested
            ? { suggested: { title: resolution.suggested.applet.identifier } }
            : {}),
          answer,
        }),
      );
      setAsking(undefined);
      if (!picked) return { ok: false, error: "user cancelled" };
      if (picked.type === "install") {
        if (resolution.type !== "choose" || !resolution.suggested) {
          return { ok: false, error: "user cancelled" };
        }
        const { applet, relays } = resolution.suggested;
        dispatch({
          type: "applets/install",
          applet,
          relays,
          addToDeck: false,
        });
        if (picked.always) {
          dispatch({
            type: "applets/set-default",
            archetype: request.archetype,
            target: { type: "applet", ...applet },
          });
        }
        return openWith({ type: "install", ...applet }, request);
      }
      const handler = candidates.find((item) => item.id === picked.id);
      if (!handler) return { ok: false, error: "user cancelled" };
      if (picked.always) {
        dispatch({
          type: "applets/set-default",
          archetype: request.archetype,
          target:
            handler.type === "streets"
              ? { type: "streets" }
              : { type: "applet", ...handler.applet },
        });
      }
      return openWith(handler, request);
    },
  });

  const viewer = () => (props.inputs.signedIn ? props.inputs.viewer : "");
  const profile = useProfile(() => viewer() || undefined);
  const mutes = useMutes();
  const ready = createMemo(() => {
    const current = manifest();
    const result = artifact();
    return current && result?.ok
      ? { manifest: current, html: result.html }
      : undefined;
  });

  const frame = (running: { manifest: NappletManifest; html: string }) => {
    let themeSource: Element | undefined;
    const host = createStreetsNappletHost({
      manifest: running.manifest,
      instance: scope.column().id,
      readLayer: scope.readLayer,
      viewer,
      relayList: props.inputs.relayList,
      profile: () => {
        const current = profile();
        return current
          ? Object.fromEntries(
              Object.entries({
                name: current.name,
                displayName: current.displayName,
                about: current.about,
                picture: current.picture,
                banner: current.banner,
                nip05: current.nip05,
              }).filter(([, value]) => value !== undefined),
            )
          : null;
      },
      follows: () => (viewer() ? props.inputs.followees() : []),
      mutes: () =>
        mutes
          ?.entries()
          .flatMap((entry) =>
            entry.target.type === "pubkey" ? [entry.target.value] : [],
          ) ?? [],
      theme: () =>
        themeSource
          ? currentNappletTheme(themeSource)
          : currentNappletTheme(document.body),
      intent: intentHost(
        running.manifest.title ?? running.manifest.identifier ?? "アップレット",
      ),
    });
    return (
      <div
        ref={(element) => {
          themeSource = element;
          activationWindow = element.ownerDocument.defaultView ?? undefined;
        }}
        class="h-full"
      >
        <NappletFrame
          html={prepareNappletSrcdoc(running.html, STREETS_NAPPLET_DOMAINS)}
          title={running.manifest.title ?? running.manifest.description}
          host={host}
          viewer={viewer()}
          onSession={setSession}
        />
      </div>
    );
  };

  return (
    <NappletView
      state={state()}
      unsupported={unsupported()}
      frame={
        <Show when={ready()} keyed>
          {frame}
        </Show>
      }
      overlay={
        <Show when={asking()}>
          {(current) => (
            <IntentSheet
              {...current()}
              onPick={(id, always) =>
                current().answer({ type: "handler", id, always })
              }
              onInstall={(always) =>
                current().answer({ type: "install", always })
              }
              onCancel={() => current().answer(undefined)}
            />
          )}
        </Show>
      }
    />
  );
};

export default Napplet;
