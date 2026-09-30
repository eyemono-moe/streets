import {
  type AppHandler,
  type ClientRef,
  handlerUrlFor,
  parseAppHandler,
} from "@streets/core/nostr/app-handler";
import { APP_HANDLER_KIND } from "@streets/core/nostr/build/client-tag";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Profile } from "@streets/core/nostr/profile";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, Match, Show, Switch } from "solid-js";
import { useReadLayer } from "../read-layer";
import Avatar from "../ui/Avatar";
import { ButtonLink } from "../ui/Button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import { useProfileDetails } from "./use-profile";

export type ClientInfoState =
  /** タグに名前しか無い。説明を探す手がかりが無い。 */
  | { phase: "name-only" }
  | { phase: "loading" }
  | { phase: "failed" }
  | {
      phase: "ready";
      profile?: Profile;
      website?: string;
      /** この投稿をそのアプリで開く URL。 */
      openUrl?: string;
    };

/** 押す前に行き先を見せる。誰でも書ける URL なので、名前だけで信用させない。 */
const hostOf = (url: string) => new URL(url).host;

const Destination: Component<{
  url: string;
  label: string;
  primary?: boolean;
}> = (props) => (
  <div class="flex flex-col items-start gap-1">
    <ButtonLink
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      variant={props.primary ? "primary" : "secondary"}
      icon="i-material-symbols:open-in-new-rounded"
    >
      {props.label}
    </ButtonLink>
    <span class="c-secondary break-all text-caption">
      開く先: {hostOf(props.url)}
    </span>
  </div>
);

export const ClientDialogView: Component<{
  /** タグに書かれた名前。 */
  name: string;
  /** アイコンが無いときの標識の元。 */
  seed: string;
  state: ClientInfoState;
  onClose: () => void;
}> = (props) => {
  const ready = () => (props.state.phase === "ready" ? props.state : undefined);
  const profile = () => ready()?.profile;
  const title = () => profile()?.displayName ?? profile()?.name ?? props.name;
  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="w-full max-w-110 rounded-3 border border-primary">
          <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
            <DialogTitle class="break-anywhere min-w-0 flex-1 font-600 text-body">
              この投稿に使われたアプリ
            </DialogTitle>
            <DialogClose />
          </div>
          <DialogBody class="flex flex-col gap-4 px-4 pb-4">
            <div class="flex items-center gap-3">
              <Avatar
                pubkey={props.seed}
                picture={profile()?.picture}
                class="size-12 rounded-2"
              />
              <p class="break-anywhere min-w-0 font-600 text-body">{title()}</p>
            </div>
            <Switch>
              <Match when={props.state.phase === "loading"}>
                <p class="c-secondary text-caption">読み込み中…</p>
              </Match>
              <Match when={props.state.phase === "name-only"}>
                <p class="c-secondary text-caption">
                  このアプリの説明は、投稿に書かれていません。
                </p>
              </Match>
              <Match when={props.state.phase === "failed"}>
                <p class="c-secondary text-caption">
                  このアプリの説明を取得できませんでした。
                </p>
              </Match>
              <Match when={ready()}>
                {(state) => (
                  <>
                    <Show when={state().profile?.about}>
                      {(about) => (
                        <p class="break-anywhere whitespace-pre-wrap text-caption">
                          {about()}
                        </p>
                      )}
                    </Show>
                    <Show
                      when={state().openUrl || state().website}
                      fallback={
                        <p class="c-secondary text-caption">
                          このアプリの開き方は書かれていません。
                        </p>
                      }
                    >
                      <div class="flex flex-col gap-3">
                        <Show when={state().openUrl}>
                          {(url) => (
                            <Destination
                              url={url()}
                              label="このアプリで投稿を開く"
                              primary
                            />
                          )}
                        </Show>
                        <Show when={state().website}>
                          {(url) => (
                            <Destination
                              url={url()}
                              label="ウェブサイトを開く"
                            />
                          )}
                        </Show>
                      </div>
                    </Show>
                  </>
                )}
              </Match>
            </Switch>
          </DialogBody>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

/** 書いていない名前・アイコン・説明は、出した人の kind:0 で埋める。 */
const withFallback = (
  handler: AppHandler,
  owner: Profile | undefined,
): Profile | undefined =>
  handler.profile || owner
    ? {
        ...owner,
        ...Object.fromEntries(
          Object.entries(handler.profile ?? {}).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      }
    : undefined;

/** 投稿の `client` タグが指すアプリの説明を取りに行き、開き方を見せる。 */
const ClientDialog: Component<{
  event: NostrEvent;
  client: ClientRef;
  onClose: () => void;
}> = (props) => {
  const { manager, store } = useReadLayer();
  const handlerRef = props.client.handler;
  // 手がかりが無ければ取りに行かない。EventScene はネットワークを持たないので、
  // 各状態は View のストーリーで確認する。
  const section =
    handlerRef && manager
      ? createSection({
          manager,
          source: () => ({
            type: "nostr",
            filters: [
              {
                kinds: [APP_HANDLER_KIND],
                authors: [handlerRef.pubkey],
                "#d": [handlerRef.identifier],
                limit: 1,
              },
            ],
            // タグに書かれたリレーを先に。書かれていなくても、よく使われるリレーに
            // 置かれていることが多い。
            relays: [
              ...new Set([
                ...(props.client.relay ? [props.client.relay] : []),
                ...FALLBACK_RELAYS,
              ]),
            ],
          }),
        })
      : undefined;
  const owner = useProfileDetails(() => handlerRef?.pubkey);
  const state = (): ClientInfoState => {
    if (!handlerRef) return { phase: "name-only" };
    if (!section) return { phase: "failed" };
    const found = section.items()[0];
    if (!found) {
      return section.status().phase === "settled"
        ? { phase: "failed" }
        : { phase: "loading" };
    }
    const handler = parseAppHandler(found);
    return {
      phase: "ready",
      profile: withFallback(handler, owner()?.profile),
      website: handler.website,
      openUrl: handlerUrlFor(
        handler,
        props.event,
        store.seenRelays(props.event.id),
      ),
    };
  };
  return (
    <ClientDialogView
      name={props.client.name}
      seed={handlerRef?.pubkey ?? props.client.name}
      state={state()}
      onClose={props.onClose}
    />
  );
};

export default ClientDialog;
