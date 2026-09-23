import { columnLinkCards } from "@streets/core/deck/deck";
import { type Component, Match, Switch } from "solid-js";
import { LinkCardModeProvider } from "../note/link-card";
import ActivityColumn from "./ActivityColumn";
import FeedColumn from "./FeedColumn";
import PeopleColumn from "./PeopleColumn";
import ThreadColumn from "./ThreadColumn";
import UserColumn from "./UserColumn";
import type { ColumnReadProps } from "./column-section";

export type ColumnContentProps = ColumnReadProps & {
  scrollerRef: (element: HTMLDivElement) => void;
};

/** source の種類に対応するカラムを選ぶだけのルーター。 */
const ColumnContent: Component<ColumnContentProps> = (props) => {
  const threadFocus = () => {
    const source = props.column.source;
    return source.kind === "thread" ? source.focus : undefined;
  };
  const activityTarget = () => {
    const source = props.column.source;
    return source.kind === "activity" ? source.target : undefined;
  };
  const profilePubkey = () => {
    const source = props.column.source;
    return source.kind === "user" ? source.pubkey : undefined;
  };

  return (
    <LinkCardModeProvider value={columnLinkCards(props.column)}>
      <Switch fallback={<FeedColumn {...props} />}>
        <Match when={threadFocus()}>
          {(focus) => (
            <ThreadColumn
              column={props.column}
              focus={focus()}
              readLayer={props.readLayer}
              expandMedia={props.column.expandMedia !== false}
              scrollerRef={props.scrollerRef}
            />
          )}
        </Match>
        <Match when={activityTarget()}>
          {(target) => <ActivityColumn {...props} target={target()} />}
        </Match>
        <Match when={profilePubkey()}>
          {(pubkey) => <UserColumn {...props} pubkey={pubkey()} />}
        </Match>
        <Match when={props.column.source.kind === "followees-list"}>
          <PeopleColumn {...props} kind="followees-list" />
        </Match>
        <Match when={props.column.source.kind === "followers-list"}>
          <PeopleColumn {...props} kind="followers-list" />
        </Match>
      </Switch>
    </LinkCardModeProvider>
  );
};

export default ColumnContent;
