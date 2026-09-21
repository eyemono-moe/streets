import { type Component, Show } from "solid-js";
import { useMediaServers } from "./MediaMediator";
import MediaSettingsView from "./MediaSettingsView";

/** 画像の預け先のページ。一覧と保存は `MediaMediator` が持つ。 */
const MediaSettings: Component = () => {
  const media = useMediaServers();
  return (
    <Show when={media}>
      {(media) => (
        <MediaSettingsView
          servers={media().servers()}
          saving={media().saving()}
          chosen={media().chosen()}
        />
      )}
    </Show>
  );
};

export default MediaSettings;
