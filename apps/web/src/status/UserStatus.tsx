import type { Component } from "solid-js";
import { useUserStatuses } from "./use-user-statuses";
import { UserStatusBadge, UserStatusPills } from "./UserStatusView";

/** 投稿のアイコンの右下の印。 */
export const AuthorStatusBadge: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return <UserStatusBadge statuses={statuses()} />;
};

/** プロフィールと名刺。 */
export const ProfileStatus: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return <UserStatusPills statuses={statuses()} />;
};
