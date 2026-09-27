import { CHANNEL_CREATE_KIND, type Channel } from "@streets/core/nostr/channel";
import { encodeNevent } from "@streets/core/nostr/nip19";
import { type Component, For, Show } from "solid-js";
import ProfileRow from "../profile/ProfileRow";
import RelaySummary from "../settings/RelaySummary";
import { notifyError } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import StorageHint from "../ui/StorageHint";
import Switch from "../ui/Switch";
import ChannelPicture from "./ChannelPicture";

/** チャンネルの情報。チャンネルのカラムの見出しの ⓘ から重ねて開く。 */
const ChannelInfoView: Component<{
  channel?: Channel;
  settled: boolean;
  favorite: boolean;
  /** ログインしていれば、お気に入りを切り替えられる。 */
  signedIn: boolean;
  /** 自分が作ったチャンネルなら、情報を直せる。 */
  editable: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const copyLink = async (channel: Channel) => {
    const nevent = encodeNevent({
      id: channel.id,
      relays: channel.metadata.relays.slice(0, 2),
      author: channel.creator,
      eventKind: CHANNEL_CREATE_KIND,
    });
    try {
      await navigator.clipboard.writeText(`nostr:${nevent}`);
    } catch (cause) {
      notifyError(cause, "リンクをコピーできませんでした");
    }
  };
  return (
    <Show
      when={props.channel}
      fallback={
        <p class="c-secondary p-4 text-caption">
          {props.settled
            ? "チャンネルの情報が見つかりませんでした。"
            : "読み込み中…"}
        </p>
      }
    >
      {(channel) => (
        <div class="flex flex-col gap-5 p-4">
          <div class="flex flex-col gap-2">
            <ChannelPicture
              url={channel().metadata.picture}
              class="size-16 rounded-3"
            />
            <h3 class="c-primary break-anywhere font-700 text-h3">
              {channel().metadata.name ?? "名前の無いチャンネル"}
            </h3>
            <Show when={channel().metadata.about}>
              {(about) => (
                <p class="c-primary break-anywhere whitespace-pre-wrap text-body">
                  {about()}
                </p>
              )}
            </Show>
          </div>
          <Show when={props.signedIn}>
            <Switch
              label="お気に入り"
              aside={<StorageHint scope="account" />}
              checked={props.favorite}
              onChange={(on) =>
                dispatch({ type: "channel/favorite", id: channel().id, on })
              }
            />
          </Show>
          <section class="flex flex-col gap-1.5">
            <h4 class="c-secondary font-600 text-caption">作った人</h4>
            <div class="overflow-hidden rounded-2 border border-primary">
              <ProfileRow pubkey={channel().creator} />
            </div>
          </section>
          <section class="flex flex-col gap-1.5">
            <h4 class="c-secondary font-600 text-caption">
              発言を読み書きするリレー
            </h4>
            <Show
              when={channel().metadata.relays.length > 0}
              fallback={
                <p class="c-secondary text-caption">
                  リレーが書かれていません。見つけたリレーで読み書きします。
                </p>
              }
            >
              <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
                <For each={channel().metadata.relays}>
                  {(url) => (
                    <li class="bg-primary">
                      <RelaySummary url={url} />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
          <div class="flex flex-wrap gap-2">
            <Show when={props.editable}>
              <Button
                icon="i-material-symbols:edit-square-outline-rounded"
                onClick={() =>
                  dispatch({
                    type: "channel-form/open-edit",
                    channel: channel(),
                  })
                }
              >
                情報を直す
              </Button>
            </Show>
            <Button
              icon="i-material-symbols:link-rounded"
              onClick={() => void copyLink(channel())}
            >
              リンクをコピー
            </Button>
          </div>
        </div>
      )}
    </Show>
  );
};

export default ChannelInfoView;
