import type { NostrEvent } from "nostr-tools";
import {
  type InitializedResource,
  type ParentComponent,
  createContext,
  createResource,
  useContext,
} from "solid-js";
import {
  type MuteItems,
  decryptMuteListContent,
} from "../shared/libs/parser/10000_muteList";
import { useMuteList, useSendMuteList } from "../shared/libs/query";
import { useMe } from "./me";

const MuteContext =
  createContext<
    readonly [
      state: InitializedResource<MuteItems>,
      actions: {
        isMuteTarget: (event: NostrEvent) =>
          | { muted: true; reason: keyof MuteItems }
          | {
              muted: false;
              reason?: undefined;
            };
        addMuteTarget: <T extends keyof MuteItems>(
          type: T,
          target: MuteItems[T][number],
        ) => void;
        removeMuteTarget: <T extends keyof MuteItems>(
          type: T,
          target: MuteItems[T][number],
        ) => void;
      },
    ]
  >();

export const MuteProvider: ParentComponent = (props) => {
  const [{ myPubkey }] = useMe();
  const muteList = useMuteList(myPubkey);

  const [muteTargets] = createResource(
    () => muteList().data?.parsed,
    async (parsed) => {
      const _myPubkey = myPubkey();

      if (parsed) {
        const decrypted =
          _myPubkey && parsed
            ? await decryptMuteListContent(parsed.privateItems, _myPubkey)
            : undefined;

        // concat
        return {
          events: parsed.publicItems.events.concat(decrypted?.events ?? []),
          users: parsed.publicItems.users.concat(decrypted?.users ?? []),
          hashtags: parsed.publicItems.hashtags.concat(
            decrypted?.hashtags ?? [],
          ),
          words: parsed.publicItems.words.concat(decrypted?.words ?? []),
        };
      }
      return {
        events: [],
        users: [],
        hashtags: [],
        words: [],
      };
    },
    {
      initialValue: {
        events: [],
        users: [],
        hashtags: [],
        words: [],
      },
    },
  );

  const isMuteTarget = (
    event: NostrEvent,
  ): { muted: true; reason: keyof MuteItems } | { muted: false } => {
    const { events, users, hashtags, words } = muteTargets();

    if (events.includes(event.id)) {
      return { muted: true, reason: "events" };
    }

    if (users.includes(event.pubkey)) {
      return { muted: true, reason: "users" };
    }

    if (
      hashtags.some((tag) =>
        event.tags.some(([type, value]) => type === "t" && value === tag),
      )
    ) {
      return { muted: true, reason: "hashtags" };
    }

    if (words.some((word) => event.content.includes(word))) {
      return { muted: true, reason: "words" };
    }

    return { muted: false };
  };

  const { sendMuteList } = useSendMuteList();
  const addMuteTarget = <T extends keyof MuteItems>(
    type: T,
    target: MuteItems[T][number],
  ) => {
    const _myPubkey = myPubkey();
    if (!_myPubkey) return;

    const current = muteTargets();
    const newTargets = {
      ...current,
      [type]: current[type].concat([target]),
    };

    sendMuteList({
      pubkey: _myPubkey,
      privateItems: newTargets,
      // TODO: もともと公開していたものはそのまま送る
      publicItems: {
        events: [],
        users: [],
        hashtags: [],
        words: [],
      },
    });
  };

  const removeMuteTarget = <T extends keyof MuteItems>(
    type: T,
    target: MuteItems[T][number],
  ) => {
    const _myPubkey = myPubkey();
    if (!_myPubkey) return;

    const current = muteTargets();
    const newTargets = {
      ...current,
      [type]: current[type].filter((t) => t !== target),
    };

    sendMuteList({
      pubkey: _myPubkey,
      privateItems: newTargets,
      // TODO: もともと公開していたものはそのまま送る
      publicItems: {
        events: [],
        users: [],
        hashtags: [],
        words: [],
      },
    });
  };

  return (
    <MuteContext.Provider
      value={[
        muteTargets,
        {
          isMuteTarget,
          addMuteTarget,
          removeMuteTarget,
        },
      ]}
    >
      {props.children}
    </MuteContext.Provider>
  );
};

export const useMute = () => {
  const ctx = useContext(MuteContext);

  if (!ctx) {
    throw new Error("useMute must be used within a MuteProvider");
  }

  return ctx;
};
