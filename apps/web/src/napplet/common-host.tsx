import type { NappletHost } from "@streets/core/napplet/session";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReactionInput } from "@streets/core/nostr/reaction";
import { type ReportReason, buildReport } from "@streets/core/nostr/report";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { For, type JSX, Show } from "solid-js";
import type { EventActions } from "../actions";
import Name from "../note/Name";
import type { AppletWriter } from "./applet-writer";
import { subscribeThroughReadLayer } from "./streets-host";

/** 確かめるシートに出すもの。 */
export type ActionPrompt = {
  title: string;
  /**
   * シートの中で描く。プロフィールを引く部品は描いている場所の文脈（読み取り層）を使う
   * ので、頼まれた時点ではなく、シートの中で作る。
   */
  body?: () => JSX.Element;
  confirmLabel: string;
  danger?: boolean;
};

const EVENT_LOOKUP_TIMEOUT_MS = 10_000;
const NAMES_SHOWN = 5;

const REPORT_LABELS: Record<ReportReason, string> = {
  nudity: "性的な内容",
  malware: "マルウェア",
  profanity: "暴言・差別",
  illegal: "違法な内容",
  spam: "スパム",
  impersonation: "なりすまし",
  other: "その他",
};

/** id で投稿を引く。手元に無ければリレーに聞き、見つからなければ undefined。 */
const findEvent = (
  readLayer: Pick<ReadLayer, "manager" | "store">,
  id: string,
): Promise<NostrEvent | undefined> => {
  const known = readLayer.store.get(id);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    let close: () => void = () => {};
    const done = (event: NostrEvent | undefined) => {
      clearTimeout(timer);
      close();
      resolve(event);
    };
    const timer = setTimeout(() => done(undefined), EVENT_LOOKUP_TIMEOUT_MS);
    close = subscribeThroughReadLayer(readLayer)([{ ids: [id], limit: 1 }], {
      event: (event) => done(event),
      eose: () => done(undefined),
    });
  });
};

const Names = (props: { pubkeys: readonly string[] }) => (
  <p class="c-primary flex flex-wrap gap-x-2 text-body">
    <For each={props.pubkeys.slice(0, NAMES_SHOWN)}>
      {(pubkey) => (
        <span class="max-w-40 truncate">
          <Name pubkey={pubkey} />
        </span>
      )}
    </For>
    <Show when={props.pubkeys.length > NAMES_SHOWN}>
      <span class="c-secondary">
        ほか {props.pubkeys.length - NAMES_SHOWN} 人
      </span>
    </Show>
  </p>
);

const Preview = (props: { event: NostrEvent }) => (
  <div class="flex flex-col gap-1 rounded-2 border border-primary bg-secondary px-3 py-2">
    <span class="c-secondary max-w-full truncate text-caption">
      <Name pubkey={props.event.pubkey} />
    </span>
    <p class="c-primary line-clamp-4 whitespace-pre-wrap break-anywhere text-body">
      {props.event.content}
    </p>
  </div>
);

const reactionText = (input: ReactionInput) =>
  input.type === "like"
    ? "いいね"
    : input.type === "emoji"
      ? `:${input.shortcode}:`
      : input.content;

/**
 * NAP-COMMON の書き込み。確かめてから、Streets のフォロー・リアクションの操作と
 * 同じ道で書く（進み具合のトーストも同じものが出る）。通報は Streets にほかの入口が
 * 無いので、通報のイベントを作って書く。
 */
export const createCommonHost = (options: {
  actions: EventActions | undefined;
  writer: AppletWriter | undefined;
  readLayer: Pick<ReadLayer, "manager" | "store">;
  /** 確かめるシートを出し、押したら true。 */
  confirm: (prompt: ActionPrompt) => Promise<boolean>;
  /** 書き込みの進み具合に出す名前。 */
  label: string;
}): NappletHost["common"] => ({
  setFollow: async (pubkeys, on) => {
    const actions = options.actions;
    if (!actions) return { ok: false, error: "not-signed-in" };
    const approved = await options.confirm({
      title: on
        ? `${pubkeys.length} 人をフォローしようとしています`
        : `${pubkeys.length} 人のフォローを外そうとしています`,
      body: () => <Names pubkeys={pubkeys} />,
      confirmLabel: on ? "フォローする" : "フォローを外す",
    });
    if (!approved) return { ok: false, error: "user-denied" };
    try {
      for (const pubkey of pubkeys) await actions.setFollow(pubkey, on);
      return { ok: true };
    } catch {
      return { ok: false, error: "publish-failed" };
    }
  },
  react: async (eventId, input) => {
    const actions = options.actions;
    if (!actions) return { ok: false, error: "not-signed-in" };
    const target = await findEvent(options.readLayer, eventId);
    if (!target) return { ok: false, error: "invalid-target" };
    const approved = await options.confirm({
      title: `「${reactionText(input)}」でリアクションしようとしています`,
      body: () => <Preview event={target} />,
      confirmLabel: "リアクションする",
    });
    if (!approved) return { ok: false, error: "user-denied" };
    try {
      await actions.react(target, input);
      return { ok: true };
    } catch {
      return { ok: false, error: "publish-failed" };
    }
  },
  report: async (target, reason, text) => {
    const writer = options.writer;
    if (!writer) return { ok: false, error: "not-signed-in" };
    // > Event reports use `e` with reason plus author `p`; shell MUST resolve or reject
    // > missing authors.
    const event =
      target.type === "event"
        ? await findEvent(options.readLayer, target.id)
        : undefined;
    const pubkey =
      target.type === "pubkey"
        ? target.pubkey
        : (target.pubkey ?? event?.pubkey);
    if (
      !pubkey ||
      (target.type === "event" && event && event.pubkey !== pubkey)
    ) {
      return { ok: false, error: "author-unresolved" };
    }
    const approved = await options.confirm({
      title: `「${REPORT_LABELS[reason]}」として通報しようとしています`,
      body: () => (
        <>
          <Show when={event} fallback={<Names pubkeys={[pubkey]} />}>
            {(shown) => <Preview event={shown()} />}
          </Show>
          <Show when={text.trim()}>
            <p class="c-secondary whitespace-pre-wrap break-anywhere text-caption">
              添える文：{text}
            </p>
          </Show>
        </>
      ),
      confirmLabel: "通報する",
      danger: true,
    });
    if (!approved) return { ok: false, error: "user-denied" };
    try {
      const result = await writer.publish(
        buildReport(
          target.type === "event"
            ? { type: "event", id: target.id, pubkey }
            : { type: "pubkey", pubkey },
          reason,
          text,
        ),
        [],
        options.label,
      );
      return { ok: true, eventId: result.event.id, event: result.event };
    } catch {
      return { ok: false, error: "publish-failed" };
    }
  },
});
