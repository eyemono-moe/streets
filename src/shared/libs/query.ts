import { kinds } from "nostr-tools";
import { normalizeURL } from "nostr-tools/utils";
import type { Event, EventParameters } from "nostr-typedef";
import { type Accessor, createEffect, createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { CacheDataBase } from "../../context/eventCache";
import { type SendingState, useLoading } from "../../context/loading";
import { useRxNostr } from "../../context/rxNostr";
import { useCoreEventByID } from "../../core/solid/use-event";
import { useCoreEventRelations } from "../../core/solid/use-event-relations";
import { useCoreProfile } from "../../core/solid/use-profile";
import {
  useCoreEmojiList,
  useCoreEmojiSets,
  useCoreEventList,
  useCoreFollowees,
  useCoreFollowers,
  useCoreUserList,
} from "../../core/solid/use-social-read";
import { genID } from "./id";
import type { ParsedEventPacket, parseNostrEvent } from "./parser";
import type { ProfileSettingsOutput } from "./parser/0_metadata";
import type { ShortTextNote } from "./parser/1_shortTextNote";
import type { Repost } from "./parser/6_repost";
import type { Reaction } from "./parser/7_reaction";
import {
  type MuteItems,
  type MuteList,
  muteItemsToTags,
} from "./parser/10000_muteList";
import type { EmojiSet } from "./parser/30030_emojiSet";
import { useNIP07 } from "./useNIP07";

export const useEventByID = <T = ReturnType<typeof parseNostrEvent>>(
  id: () => string | undefined,
  relays?: () => string[] | undefined,
) => useCoreEventByID<T>(id, relays);

export const useFollowees = (pubkey: () => string | undefined) => {
  return useCoreFollowees(pubkey);
};

export const useFollowers = (pubkey: () => string | undefined) => {
  return useCoreFollowers(pubkey);
};

export const useProfile = (pubkey: () => string | undefined) =>
  useCoreProfile(pubkey);

export const useReactionsOfEvent = (eventID: () => string | undefined) => {
  return useCoreEventRelations<Reaction>(() => {
    const _eventID = eventID();
    return _eventID
      ? { kinds: [kinds.Reaction], tags: { e: [_eventID] } }
      : undefined;
  });
};

export const useRepostsOfEvent = (eventID: () => string | undefined) => {
  return useCoreEventRelations<Repost>(() => {
    const _eventID = eventID();
    return _eventID
      ? { kinds: [kinds.Repost, kinds.GenericRepost], tags: { e: [_eventID] } }
      : undefined;
  });
};

export const useQuotesOfEvent = (eventID: () => string | undefined) => {
  return useCoreEventRelations<ShortTextNote>(() => {
    const _eventID = eventID();
    return _eventID
      ? { kinds: [kinds.ShortTextNote], tags: { q: [_eventID] } }
      : undefined;
  });
};

export const useRepliesOfEvent = (eventID: () => string | undefined) => {
  return useCoreEventRelations<ShortTextNote>(() => {
    const _eventID = eventID();
    return _eventID
      ? { kinds: [kinds.ShortTextNote], tags: { e: [_eventID] } }
      : undefined;
  });
};

export const useEmojis = (pubkey: () => string | undefined) => {
  const emojiList = useCoreEmojiList(pubkey);
  const coreEmojiSets = useCoreEmojiSets(
    () => emojiList().data?.parsed.emojiSets ?? [],
  );
  const emojiSets = createMemo<
    Accessor<CacheDataBase<ParsedEventPacket<EmojiSet>>>[]
  >(() => coreEmojiSets().map((emojiSet) => () => emojiSet));

  return {
    emojiList,
    emojiSets,
  };
};

export const useMuteList = (pubkey: () => string | undefined) => {
  return useCoreEventList<MuteList>(() => {
    const _pubkey = pubkey();
    return _pubkey
      ? { kinds: [kinds.Mutelist], authors: [_pubkey], limit: 1 }
      : undefined;
  });
};

export const useUserList = () => useCoreUserList();

const initialSendState = (): SendingState => ({
  id: "",
  sending: false,
  successAny: undefined,
  relayStates: {},
  error: undefined,
});

const createSender = () => {
  const { core } = useRxNostr();
  const [sendState, setSendState] = createStore<SendingState>(
    initialSendState(),
  );
  const [latestSendState, { setLatestSendState }] = useLoading();

  const sender = (event: EventParameters, onComplete?: () => void) => {
    setSendState("id", genID());
    setSendState("sending", true);
    setSendState("successAny", false);
    setSendState("relayStates", reconcile({}));
    setSendState("error", undefined);

    setLatestSendState(sendState);
    createEffect(() => {
      void sendState.sending;
      const latestId = latestSendState.id;
      if (latestId === sendState.id) {
        setLatestSendState(sendState);
      }
    });

    return new Promise<void>((resolve) => {
      core.transport.publish(event).subscribe({
        next: (e) => {
          if (e.ok && e.done) {
            setSendState("successAny", true);
            setSendState("relayStates", normalizeURL(e.from), {
              done: true,
            });
            resolve();
          }
          if (e.notice) {
            setSendState("relayStates", normalizeURL(e.from), {
              notice: e.notice,
            });
          }
        },
        error(err) {
          console.error("[send] error on sending", err);
          setSendState("error", err);
        },
        complete: () => {
          setSendState("sending", false);
          onComplete?.();
          resolve(); // 一つも送信できなかった場合のためここでもresolveする
        },
      });
    });
  };

  return {
    core,
    sendState,
    sender,
  };
};

export const useSendShortText = () => {
  const { sender, sendState } = createSender();

  const sendShortText = (props: {
    content: string;
    // TODO: typing
    tags?: string[][];
  }) =>
    sender({
      kind: kinds.ShortTextNote,
      content: props.content,
      tags: props.tags ?? [],
    });

  return {
    sendShortText,
    sendState,
  };
};

export const useSendReaction = () => {
  const { core, sender, sendState } = createSender();

  const sendReaction = (props: {
    content: Reaction["content"];
    targetEventId: string;
    targetEventPubkey: string;
    kind?: number;
  }) => {
    const tags = [
      ["e", props.targetEventId, ""],
      ["p", props.targetEventPubkey],
      ["k", props.kind?.toString() ?? "1"],
    ];
    if (props.content.type === "emoji") {
      tags.push(["emoji", props.content.name, props.content.url]);
    }
    const content =
      props.content.type === "emoji"
        ? `:${props.content.name}:`
        : props.content.type === "like"
          ? "+"
          : props.content.content;

    return sender(
      {
        kind: kinds.Reaction,
        content,
        tags,
      },
      () => {
        void core.queryClient.ensureEventRelations({
          query: {
            kinds: [kinds.Reaction],
            tags: { e: [props.targetEventId] },
          },
        });
      },
    );
  };

  return {
    sendReaction,
    sendState,
  };
};

export const useSendRepost = () => {
  const { core, sender, sendState } = createSender();

  const sendRepost = (props: { targetEvent: Event; relay: string }) => {
    const tags = [
      ["e", props.targetEvent.id, props.relay],
      ["p", props.targetEvent.pubkey],
    ];

    // ShortTextNote以外のイベントの場合はkindを追加
    if (props.targetEvent.kind !== kinds.ShortTextNote) {
      tags.push(["k", props.targetEvent.kind.toString()]);
    }

    return sender(
      {
        // ShortTextNote以外のイベントの場合はGenericRepostにする
        kind:
          props.targetEvent.kind === kinds.ShortTextNote
            ? kinds.Repost
            : kinds.GenericRepost,
        tags,
        content: JSON.stringify(props.targetEvent),
      },
      () => {
        void core.queryClient.ensureEventRelations({
          query: {
            kinds: [kinds.Repost, kinds.GenericRepost],
            tags: { e: [props.targetEvent.id] },
          },
        });
      },
    );
  };

  return {
    sendRepost,
    sendState,
  };
};

export const useSendContacts = () => {
  const { core, sender, sendState } = createSender();

  const sendContacts = (props: {
    pubkey: string;
    newFollowees: string[];
    content: string;
  }) => {
    const tags = props.newFollowees.map((pubkey) => ["p", pubkey]);

    return sender(
      {
        kind: kinds.Contacts,
        tags,
        content: props.content,
      },
      () => {
        void core.queryClient.ensureEventRelations({
          query: { kinds: [kinds.Contacts], authors: [props.pubkey], limit: 1 },
        });
      },
    );
  };

  return {
    sendContacts,
    sendState,
  };
};

export const useSendProfile = () => {
  const { core, sender, sendState } = createSender();

  const sendProfile = (props: {
    pubkey: string;
    profile: ProfileSettingsOutput;
  }) => {
    return sender(
      {
        kind: kinds.Metadata,
        content: JSON.stringify(props.profile),
      },
      () => {
        void core.queryClient.ensureProfile({ pubkey: props.pubkey });
      },
    );
  };

  return {
    sendProfile,
    sendState,
  };
};

export const useSendMuteList = () => {
  const { core, sender, sendState } = createSender();

  const sendMuteList = async (props: {
    pubkey: string;
    publicItems: MuteItems;
    privateItems: MuteItems;
  }) => {
    const encrypted = await useNIP07().nip04?.encrypt(
      props.pubkey,
      JSON.stringify(muteItemsToTags(props.privateItems)),
    );
    return sender(
      {
        kind: kinds.Mutelist,
        content: encrypted ?? "",
        tags: muteItemsToTags(props.publicItems),
      },
      () => {
        void core.queryClient.ensureEventRelations({
          query: { kinds: [kinds.Mutelist], authors: [props.pubkey], limit: 1 },
        });
      },
    );
  };

  return {
    sendMuteList,
    sendState,
  };
};
