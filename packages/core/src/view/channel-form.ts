import type { ChannelMetadataInput } from "../nostr/build/channel";
import type { Channel } from "../nostr/channel";
import type { RelayUrl } from "../relay/relay-connection";

export type ChannelDraft = {
  name: string;
  about: string;
  picture: string;
  relays: RelayUrl[];
};

/**
 * チャンネルを作る・直すフォーム。書きかけがある間は閉じさせない（AGENTS の
 * 「保存」を押すフォームの決まり）。閉じようとしたら `blocked` を立て、画面は
 * 「保存するか、やめてから閉じてください」を出す。
 */
export type ChannelFormState =
  | { phase: "closed" }
  | {
      phase: "editing" | "saving";
      mode: "create" | "edit";
      /** 直すときのチャンネル。 */
      channelId?: string;
      draft: ChannelDraft;
      /** 開いたときの中身。書きかけかどうかを比べる。 */
      initial: ChannelDraft;
      /** 作ったらお気に入りに入れるか（作るときだけ）。 */
      favorite: boolean;
      /** 書きかけのまま閉じようとした。 */
      blocked: boolean;
    };

export type ChannelFormEvent =
  | { type: "channel-form/open-create"; relays: readonly RelayUrl[] }
  | { type: "channel-form/open-edit"; channel: Channel }
  | {
      type: "channel-form/input";
      field: "name" | "about" | "picture";
      value: string;
    }
  | { type: "channel-form/relays"; relays: readonly RelayUrl[] }
  | { type: "channel-form/favorite"; on: boolean }
  | { type: "channel-form/submit" }
  | { type: "channel-form/saved" }
  | { type: "channel-form/failed" }
  /** 閉じようとした（× や Esc）。書きかけがあれば閉じない。 */
  | { type: "channel-form/close" }
  /** 「やめる」。書きかけを捨てて閉じる。 */
  | { type: "channel-form/discard" };

export const closedChannelForm = (): ChannelFormState => ({ phase: "closed" });

const sameDraft = (a: ChannelDraft, b: ChannelDraft) =>
  a.name === b.name &&
  a.about === b.about &&
  a.picture === b.picture &&
  a.relays.join() === b.relays.join();

export const isChannelFormDirty = (state: ChannelFormState): boolean =>
  state.phase !== "closed" && !sameDraft(state.draft, state.initial);

/** 送れるか。名前が要り、リレーは 1 本以上要る（発言を読み書きする先が無くなる）。 */
export const canSubmitChannelForm = (state: ChannelFormState): boolean =>
  state.phase === "editing" &&
  state.draft.name.trim().length > 0 &&
  state.draft.relays.length > 0 &&
  (state.mode === "create" || isChannelFormDirty(state));

export const channelFormInput = (
  draft: ChannelDraft,
): ChannelMetadataInput => ({
  name: draft.name,
  about: draft.about,
  picture: draft.picture,
  relays: draft.relays,
});

const open = (
  mode: "create" | "edit",
  draft: ChannelDraft,
  channelId?: string,
): ChannelFormState => ({
  phase: "editing",
  mode,
  ...(channelId ? { channelId } : {}),
  draft,
  initial: { ...draft, relays: [...draft.relays] },
  favorite: mode === "create",
  blocked: false,
});

export const channelFormTransition = (
  state: ChannelFormState,
  event: ChannelFormEvent,
): ChannelFormState => {
  switch (event.type) {
    case "channel-form/open-create":
      // 書きかけがあるときに開き直させない。今の書きかけを先に片付けてもらう。
      if (state.phase !== "closed") return state;
      return open("create", {
        name: "",
        about: "",
        picture: "",
        relays: [...event.relays],
      });
    case "channel-form/open-edit":
      if (state.phase !== "closed") return state;
      return open(
        "edit",
        {
          name: event.channel.metadata.name ?? "",
          about: event.channel.metadata.about ?? "",
          picture: event.channel.metadata.picture ?? "",
          relays: [...event.channel.metadata.relays],
        },
        event.channel.id,
      );
  }
  if (state.phase === "closed") return state;
  switch (event.type) {
    case "channel-form/input":
      if (state.phase === "saving") return state;
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
        blocked: false,
      };
    case "channel-form/relays":
      if (state.phase === "saving") return state;
      return {
        ...state,
        draft: { ...state.draft, relays: [...event.relays] },
        blocked: false,
      };
    case "channel-form/favorite":
      return { ...state, favorite: event.on };
    case "channel-form/submit":
      return canSubmitChannelForm(state)
        ? { ...state, phase: "saving", blocked: false }
        : state;
    case "channel-form/saved":
      return closedChannelForm();
    case "channel-form/failed":
      return { ...state, phase: "editing" };
    case "channel-form/close":
      if (state.phase === "saving") return state;
      return isChannelFormDirty(state)
        ? { ...state, blocked: true }
        : closedChannelForm();
    case "channel-form/discard":
      return state.phase === "saving" ? state : closedChannelForm();
  }
  return state;
};
