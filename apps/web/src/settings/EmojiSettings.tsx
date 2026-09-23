import { type Component, Show } from "solid-js";
import { useCustomEmojis } from "../emoji/custom-emojis";
import EmojiSetSearch from "./EmojiSetSearch";
import EmojiSettingsView from "./EmojiSettingsView";

/** 自分の絵文字のページ。一覧と保存は `CustomEmojisMediator` が持つ。 */
const EmojiSettings: Component = () => {
  const emojis = useCustomEmojis();
  return (
    <Show when={emojis}>
      {(emojis) => (
        <EmojiSettingsView
          emojis={emojis().list().emojis}
          sets={emojis()
            .list()
            .sets.map((ref) => ({
              ref,
              set: emojis()
                .sets()
                .find(
                  (set) =>
                    set.pubkey === ref.pubkey &&
                    set.identifier === ref.identifier,
                ),
            }))}
          saving={emojis().saving()}
          search={<EmojiSetSearch />}
        />
      )}
    </Show>
  );
};

export default EmojiSettings;
