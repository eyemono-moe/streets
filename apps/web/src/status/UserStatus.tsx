import type { Component } from "solid-js";
import { useUserStatuses } from "./use-user-statuses";
import { UserStatusLine, UserStatusPills } from "./UserStatusView";

/** 投稿の名前の下の 1 行。 */
export const AuthorStatusLine: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return <UserStatusLine statuses={statuses()} />;
};

/** プロフィールと名刺。 */
export const ProfileStatus: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return <UserStatusPills statuses={statuses()} />;
};
