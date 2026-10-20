import { streetsIntentColumn } from "@streets/core/deck/intent-columns";
import { tempColumnFor } from "@streets/core/deck/temp-column";
import { fetchNappletArtifact } from "@streets/core/napplet/artifact";
import { catalogSnapshot } from "@streets/core/napplet/catalog";
import {
  type IntentHandler,
  type IntentRequest,
  type IntentResult,
  STREETS_CONTRACTS,
  STREETS_HANDLER_ID,
  appletHandlerId,
  intentAvailability,
  intentHandlers,
  resolveIntent,
} from "@streets/core/napplet/intent";
import {
  type AppletAddress,
  emptyAppletLibrary,
  hasGrant,
} from "@streets/core/napplet/library";
import {
  INTENT_CONVENTION,
  type NappletManifest,
} from "@streets/core/napplet/manifest";
import {
  NOTIFY_GRANT,
  UPLOAD_GRANT,
  grantKey,
  overwritesState,
  rememberable,
} from "@streets/core/napplet/publish";
import type {
  NappletHost,
  NappletSession,
} from "@streets/core/napplet/session";
import { prepareNappletSrcdoc } from "@streets/core/napplet/srcdoc";
import { kindLabel } from "@streets/core/nostr/kind-support";
import {
  type Component,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { useEventActions } from "../../actions";
import { useUploader } from "../../media/uploader";
import ActionSheet from "../../napplet/ActionSheet";
import { appletConfig } from "../../napplet/applet-config";
import {
  appletColumnFor,
  useAppletIntents,
} from "../../napplet/applet-intents";
import { useAppletLibrary } from "../../napplet/applet-library";
import { useAppletWriter } from "../../napplet/applet-writer";
import { type ActionPrompt, createCommonHost } from "../../napplet/common-host";
import IntentSheet, { type IntentSheetProps } from "../../napplet/IntentSheet";
import LinkSheet, { type LinkSheetProps } from "../../napplet/LinkSheet";
import { createListsHost } from "../../napplet/lists-host";
import NappletFrame from "../../napplet/NappletFrame";
import NappletView, { type NappletPhase } from "../../napplet/NappletView";
import { createNotifyHost } from "../../napplet/notify-host";
import {
  STREETS_NAPPLET_DOMAINS,
  createStreetsNappletHost,
} from "../../napplet/streets-host";
import { currentNappletTheme } from "../../napplet/theme-colors";
import { createUploadHost } from "../../napplet/upload-host";
import UploadSheet, { type UploadPrompt } from "../../napplet/UploadSheet";
import WriteSheet, { type WriteSheetProps } from "../../napplet/WriteSheet";
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
  // NAP-INC の endpoint として登録する。id は動いている間だけのもの。
  let endpoint: { id: string; leave: () => void } | undefined;
  createEffect(() => {
    const current = session();
    if (!current || !intents) return;
    const joined = intents.join(current);
    endpoint = joined;
    onCleanup(() => {
      joined.leave();
      if (endpoint === joined) endpoint = undefined;
    });
  });
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

  // カラムの設定で値が変わったら、購読しているアップレットに知らせる。
  createEffect(
    on(
      () => appletConfig.read(self)?.values,
      () => session()?.configChanged(),
      { defer: true },
    ),
  );
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

  // 描いている窓（ピクチャーインピクチャーなら、その窓）。ref の時点では要素がまだ
  // テンプレートの文書にあり defaultView が無いので、使うときに引く。
  let hostElement: Element | undefined;
  const hostWindow = () => hostElement?.ownerDocument.defaultView ?? undefined;
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
        hostWindow()?.navigator.userActivation?.isActive ?? false;
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

  const writer = useAppletWriter();
  const [writing, setWriting] = createSignal<
    Omit<WriteSheetProps, "onApprove" | "onCancel"> & {
      answer: (approved: { remember: boolean } | undefined) => void;
    }
  >();
  // 書き込みは 1 つずつ確かめる。確かめている間に次が来たら、前の答えを待たせる。
  let writeQueue: Promise<unknown> = Promise.resolve();
  const publishFor =
    (sourceTitle: string): NappletHost["publish"] =>
    (request) => {
      const run = async (): Promise<
        Awaited<ReturnType<NappletHost["publish"]>>
      > => {
        if (!writer) return { ok: false, error: "denied: not signed in" };
        const { draft, operation } = request;
        const key = grantKey(operation, draft.kind);
        const granted =
          rememberable(draft.kind) &&
          hasGrant(library() ?? emptyAppletLibrary(), self, key);
        if (!granted) {
          const label = kindLabel(draft.kind);
          const approved = await new Promise<{ remember: boolean } | undefined>(
            (answer) =>
              setWriting({
                source: sourceTitle,
                kind: draft.kind,
                kindLabel:
                  label === "イベント"
                    ? `kind:${draft.kind} のイベント`
                    : label,
                content: draft.content,
                mentions: [
                  ...new Set(
                    draft.tags.flatMap((tag) =>
                      tag[0] === "p" && tag[1] ? [tag[1]] : [],
                    ),
                  ),
                ],
                tagCount: draft.tags.length,
                ...(request.recipient ? { recipient: request.recipient } : {}),
                overwrites: overwritesState(draft.kind),
                rememberable: rememberable(draft.kind),
                answer,
              }),
          );
          setWriting(undefined);
          if (!approved) return { ok: false, error: "denied: user cancelled" };
          if (approved.remember) {
            dispatch({
              type: "applets/set-grant",
              applet: self,
              key,
              on: true,
            });
          }
        }
        try {
          const content =
            operation === "publishEncrypted" && request.recipient
              ? await (writer.encrypt?.(request.recipient, draft.content) ??
                  Promise.reject(new Error("encryption unavailable")))
              : draft.content;
          const result = await writer.publish(
            { ...draft, content },
            request.relays ?? [],
            `${sourceTitle} の書き込み`,
          );
          return {
            ok: true,
            event: result.event,
            relays: Object.fromEntries([
              ...result.accepted.map((relay) => [relay, true] as const),
              ...result.rejected.map(({ relay }) => [relay, false] as const),
            ]),
          };
        } catch (cause) {
          return {
            ok: false,
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }
      };
      const next = writeQueue.then(run, run);
      writeQueue = next;
      return next;
    };

  const [linking, setLinking] = createSignal<
    Omit<LinkSheetProps, "onOpen" | "onCancel"> & {
      answer: (open: boolean) => void;
    }
  >();
  const openLinkFor =
    (sourceTitle: string): NappletHost["openLink"] =>
    async (target, label) => {
      if (target.type === "nostr") {
        const column = tempColumnFor(target.entity);
        if (!column) return { status: "denied", error: "invalid-url" };
        dispatch({
          type: "stack/open",
          column: { ...column, id: `link:${target.entity}` },
        });
        return { status: "opened" };
      }
      const view = hostWindow();
      if (!view) return { status: "denied", error: "blocked-by-policy" };
      // NAP-LINK: > Shells SHOULD require a user gesture or prompt unless policy already
      // > allows the request. 押されて開くもの（ふつうのリンク）は確かめない。
      if (!view.navigator.userActivation?.isActive) {
        if (linking()) return { status: "denied", error: "blocked-by-policy" };
        const open = await new Promise<boolean>((answer) =>
          setLinking({
            source: sourceTitle,
            url: target.url,
            hostname: target.hostname,
            ...(label ? { label } : {}),
            answer,
          }),
        );
        setLinking(undefined);
        if (!open) return { status: "denied", error: "user-denied" };
      }
      // > The shell MUST NOT expose `window.opener` or equivalent authority back to the napplet.
      view.open(target.url, "_blank", "noopener,noreferrer");
      return { status: "opened" };
    };

  const eventActions = useEventActions();
  const uploader = useUploader();
  const [uploading, setUploading] = createSignal<
    UploadPrompt & {
      answer: (approved: { remember: boolean } | undefined) => void;
    }
  >();
  const [confirming, setConfirming] = createSignal<
    ActionPrompt & { answer: (approved: boolean) => void }
  >();
  // 確かめるのは 1 つずつ。答えを待っている間に来た分は、前の答えを待たせる。
  let confirmQueue: Promise<unknown> = Promise.resolve();
  const confirm = (prompt: ActionPrompt): Promise<boolean> => {
    const ask = () =>
      new Promise<boolean>((answer) =>
        setConfirming({ ...prompt, answer }),
      ).then((approved) => {
        setConfirming(undefined);
        return approved;
      });
    const next = confirmQueue.then(ask, ask);
    confirmQueue = next;
    return next;
  };

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
    const sourceTitle =
      running.manifest.title ?? running.manifest.identifier ?? "アップレット";
    const notices = createNotifyHost({
      source: () => sourceTitle,
      granted: () =>
        hasGrant(library() ?? emptyAppletLibrary(), self, NOTIFY_GRANT),
      grant: () =>
        dispatch({
          type: "applets/set-grant",
          applet: self,
          key: NOTIFY_GRANT,
          on: true,
        }),
      ask: () =>
        confirm({
          title: "このアップレットに通知を出させますか？",
          body: () => (
            <p class="c-secondary text-caption">
              許すと、アップレットが Streets
              の通知（画面の端の知らせ）を出せるようになります。情報のカラムからいつでも取り消せます。
            </p>
          ),
          confirmLabel: "許可する",
        }),
      report: (event) => session()?.notifyEvent(event),
    });
    onCleanup(notices.dispose);
    const uploads = createUploadHost({
      uploader: () => uploader,
      granted: () =>
        hasGrant(library() ?? emptyAppletLibrary(), self, UPLOAD_GRANT),
      grant: () =>
        dispatch({
          type: "applets/set-grant",
          applet: self,
          key: UPLOAD_GRANT,
          on: true,
        }),
      ask: (prompt) =>
        new Promise<{ remember: boolean } | undefined>((answer) =>
          setUploading({ ...prompt, answer }),
        ).finally(() => setUploading(undefined)),
    });
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
      // 押したものとして、カラムの場所から流す。デッキのショートカット（TanStack Hotkeys）は
      // 押しっぱなしの連打を離すまで止めるので、離したことも続けて流す。
      forwardKey: (key) => {
        const init = {
          key: key.key,
          code: key.code,
          ctrlKey: key.ctrl,
          altKey: key.alt,
          shiftKey: key.shift,
          metaKey: key.meta,
          bubbles: true,
        };
        hostElement?.dispatchEvent(new KeyboardEvent("keydown", init));
        hostElement?.dispatchEvent(new KeyboardEvent("keyup", init));
      },
      config: {
        register: (schema) =>
          appletConfig.register(self, running.manifest.artifactHash, schema),
        stored: () => appletConfig.read(self)?.values ?? {},
        // 節（section）までは送らない。カラムの設定を開くだけ。
        openSettings: () =>
          dispatch({ type: "deck/toggle-settings", id: scope.column().id }),
      },
      lists: createListsHost({
        writer,
        confirm,
        label: `${sourceTitle} の書き込み`,
      }),
      notify: notices.host,
      upload: uploads,
      catalog: () =>
        catalogSnapshot(
          intents?.installed() ?? [],
          library() ?? emptyAppletLibrary(),
          new Set(
            STREETS_CONTRACTS.flatMap(
              (contract) =>
                INTENT_CONVENTION.exec(contract.convention)?.[1] ?? [],
            ),
          ),
        ),
      common: createCommonHost({
        actions: eventActions,
        writer,
        readLayer: scope.readLayer,
        confirm,
        label: `${running.manifest.title ?? running.manifest.identifier ?? "アップレット"} の書き込み`,
      }),
      openLink: openLinkFor(
        running.manifest.title ?? running.manifest.identifier ?? "アップレット",
      ),
      publish: publishFor(
        running.manifest.title ?? running.manifest.identifier ?? "アップレット",
      ),
      inc: {
        emit: (topic, payload) => {
          if (endpoint) intents?.emit(endpoint.id, topic, payload);
        },
      },
      intent: intentHost(
        running.manifest.title ?? running.manifest.identifier ?? "アップレット",
      ),
    });
    return (
      <div
        ref={(element) => {
          themeSource = element;
          hostElement = element;
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
        <>
          <Show when={uploading()}>
            {(current) => (
              <UploadSheet
                {...current()}
                source={
                  manifest()?.title ?? manifest()?.identifier ?? "アップレット"
                }
                onApprove={(remember) => current().answer({ remember })}
                onCancel={() => current().answer(undefined)}
              />
            )}
          </Show>
          <Show when={confirming()}>
            {(current) => (
              <ActionSheet
                source={
                  manifest()?.title ?? manifest()?.identifier ?? "アップレット"
                }
                title={current().title}
                confirmLabel={current().confirmLabel}
                danger={current().danger}
                onConfirm={() => current().answer(true)}
                onCancel={() => current().answer(false)}
              >
                {current().body?.()}
              </ActionSheet>
            )}
          </Show>
          <Show when={linking()}>
            {(current) => (
              <LinkSheet
                {...current()}
                onOpen={() => current().answer(true)}
                onCancel={() => current().answer(false)}
              />
            )}
          </Show>
          <Show when={writing()}>
            {(current) => (
              <WriteSheet
                {...current()}
                onApprove={(remember) => current().answer({ remember })}
                onCancel={() => current().answer(undefined)}
              />
            )}
          </Show>
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
        </>
      }
    />
  );
};

export default Napplet;
