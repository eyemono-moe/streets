import { parseContent } from "@streets/core/nostr/content";
import type { Profile } from "@streets/core/nostr/profile";
import { profileLabel } from "@streets/core/nostr/profile";
import type { Component } from "solid-js";
import { ContentTokens } from "./NoteText";
import { useProfileDetails } from "./use-profile";

export const ProfileText: Component<{
  text: string;
  tags?: readonly string[][];
}> = (props) => (
  <ContentTokens
    tokens={parseContent(props.text, props.tags ?? [])}
    emojiClass="h-[1em]"
    interactive={false}
  />
);

export const ProfileName: Component<{
  pubkey: string;
  profile: Profile | undefined;
  tags?: readonly string[][];
}> = (props) => (
  <ProfileText
    text={profileLabel(props.profile, props.pubkey)}
    tags={props.tags}
  />
);

/** その人を 1 語で指す名前。表示名が無ければ npub の先頭。 */
const Name: Component<{ pubkey: string }> = (props) => {
  const details = useProfileDetails(() => props.pubkey);
  return (
    <ProfileName
      pubkey={props.pubkey}
      profile={details()?.profile}
      tags={details()?.tags}
    />
  );
};

export default Name;
