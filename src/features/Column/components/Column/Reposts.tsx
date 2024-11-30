import { Tabs } from "@kobalte/core/tabs";
import { type Component, For, Show, createMemo } from "solid-js";
import { useI18n } from "../../../../i18n";
import Event from "../../../../shared/components/Event";
import {
  useQuotesOfEvent,
  useRepostsOfEvent,
} from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { ColumnContent } from "../../libs/deckSchema";
import { useOpenUserColumn } from "../../libs/useOpenColumn";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const Reposts: Component<{
  state: ColumnContent<"reposts">;
  isTempColumn?: boolean;
}> = (props) => {
  const t = useI18n();

  const openUserColumn = useOpenUserColumn();

  const reposts = useRepostsOfEvent(() => props.state.targetEventID);
  const repostedUsers = createMemo(() =>
    reposts().data?.map((r) => r.parsed.pubkey),
  );

  const quotes = useQuotesOfEvent(() => props.state.targetEventID);

  return (
    <div
      class="grid h-full w-full divide-y"
      classList={{
        "grid-rows-[1fr]": props.isTempColumn,
        "grid-rows-[auto_minmax(0,1fr)]": !props.isTempColumn,
      }}
    >
      <Show
        when={props.isTempColumn}
        fallback={<ColumnHeader title={t("column.reposts.title")} />}
      >
        <TempColumnHeader title={t("column.reposts.title")} />
      </Show>
      <Tabs
        class="grid h-full grid-rows-[auto_minmax(0,1fr)]"
        defaultValue="quotes"
      >
        <Tabs.List class="b-b-1 relative flex items-center">
          <Tabs.Trigger
            value="quotes"
            class="w-full appearance-none bg-transparent p-2 active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover"
          >
            {t("column.reposts.quotes")}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="reposts"
            class="w-full appearance-none bg-transparent p-2 active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover"
          >
            {t("column.reposts.repostUsers")}
          </Tabs.Trigger>
          <Tabs.Indicator class="absolute bottom--1px h-2px rounded-full bg-accent-5 transition-200 transition-all" />
        </Tabs.List>
        <Tabs.Content
          value="quotes"
          class="children-b-b-1 h-full h-full overflow-y-auto"
        >
          <For
            each={quotes().data}
            fallback={
              <div class="flex h-full w-full items-center justify-center">
                {t("column.reposts.noQuotes")}
              </div>
            }
          >
            {(quote) => <Event event={quote} showActions showReactions />}
          </For>
        </Tabs.Content>
        <Tabs.Content
          as="ul"
          value="reposts"
          class="children-b-b-1 h-full overflow-y-auto"
        >
          <For
            each={repostedUsers()}
            fallback={
              <div class="flex h-full w-full items-center justify-center">
                {t("column.reposts.noReposts")}
              </div>
            }
          >
            {(repostedUserPubkey) => (
              <li>
                <ProfileRow
                  pubkey={repostedUserPubkey}
                  onClick={() => openUserColumn(repostedUserPubkey)}
                />
              </li>
            )}
          </For>
        </Tabs.Content>
      </Tabs>
    </div>
  );
};

export default Reposts;
