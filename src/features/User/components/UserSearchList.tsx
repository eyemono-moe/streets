import Fuse from "fuse.js";
import { type Component, For, createMemo, createSignal } from "solid-js";
import { useI18n } from "../../../i18n";
import { TextField } from "../../../shared/components/UI/TextField";
import type { ParsedEventPacket } from "../../../shared/libs/parser";
import type { Metadata } from "../../../shared/libs/parser/0_metadata";
import { useCacheByQueryKey } from "../../../shared/libs/query";
import ProfileRow from "./ProfileRow";

const UserSearchList: Component<{
  onSelect?: (pubkey: string) => void;
}> = (props) => {
  const t = useI18n();

  const [query, setQuery] = createSignal("");

  const loadedUsers = useCacheByQueryKey<ParsedEventPacket<Metadata>>(() => [
    0,
  ]);
  const fuse = createMemo(
    () =>
      new Fuse(loadedUsers() ?? [], {
        keys: ["data.parsed.name", "data.parsed.display_name"],
      }),
  );
  const filteredUsers = createMemo(() => {
    if (!query()) return loadedUsers();
    return fuse()
      .search(query())
      .map((result) => result.item);
  });

  return (
    <div class="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-1">
      <TextField
        placeholder={t("profile.searchPlaceholder")}
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <ul class="b-1 h-full divide-y overflow-y-auto overflow-x-hidden rounded-2">
        <For each={filteredUsers()}>
          {(followee) => (
            <li>
              <ProfileRow
                pubkey={followee.data?.parsed.pubkey}
                // biome-ignore lint/style/noNonNullAssertion: useCacheByQueryKey内でnullチェックしている
                onClick={() => props.onSelect?.(followee.data!.parsed.pubkey)}
              >
                <div class="i-material-symbols:chevron-right-rounded c-zinc-5 aspect-square h-1lh w-auto" />
              </ProfileRow>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
};

export default UserSearchList;