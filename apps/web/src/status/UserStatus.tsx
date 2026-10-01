import type { Component } from "solid-js";
import { useUserStatuses } from "./use-user-statuses";
import { UserStatusBadge } from "./UserStatusView";

/** 投稿のアイコンの右下の印。 */
export const AuthorStatusBadge: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return <UserStatusBadge statuses={statuses()} />;
};
