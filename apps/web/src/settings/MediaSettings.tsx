import { type Component, Show } from "solid-js";
import { imageDownscaling } from "../image-downscaling-setting";
import { useMediaServers } from "./MediaMediator";
import MediaSettingsView from "./MediaSettingsView";

/** 画像のアップロード先のページ。一覧と保存は `MediaMediator` が持つ。 */
const MediaSettings: Component = () => {
  const media = useMediaServers();
  return (
    <Show when={media}>
      {(media) => (
        <MediaSettingsView
          servers={media().servers()}
          saving={media().saving()}
          chosen={media().chosen()}
          imageDownscaling={imageDownscaling()}
        />
      )}
    </Show>
  );
};

export default MediaSettings;
