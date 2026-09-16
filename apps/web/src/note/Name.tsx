import { profileLabel } from "@streets/core/nostr/profile";
import type { Component } from "solid-js";
import { useProfile } from "./use-profile";

/** その人を 1 語で指す名前。表示名が無ければ npub の先頭。 */
const Name: Component<{ pubkey: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  return <>{profileLabel(profile(), props.pubkey)}</>;
};

export default Name;
