import { type Component, Show, createSignal } from "solid-js";
import { useRender } from "../../core/view/render-context";
import NoteContent from "./NoteContent";
import { npubLabel } from "./npub-label";
import { useProfileData } from "./profile-data";

/** `nip05` の表示はドメイン部分だけ (v0 の `Nip05Badge` と同じ)。 */
const nip05Domain = (nip05: string): string | undefined => {
  const at = nip05.lastIndexOf("@");
  return at >= 0 ? nip05.slice(at + 1) : undefined;
};

/** `javascript:` などを踏ませない。`http(s)` 以外はリンクにしない。 */
const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * kind:0 を面として描く (仕様 3 節)。v0 の
 * `features/User/components/Profile.tsx` の縦の並びを写す。
 *
 * **取得経路を増やさない。** ここが出す情報はすべて kind:0 の中にあり、
 * 著者名 (`<Profile>`) とアイコン (`<Avatar>`) が既に同じ kind:0 を
 * `useProfileData` 経由で要求している。ホバーしたから増える通信は無い。
 *
 * 寸法は v0 の `small` 相当 1 つだけ。#205 が大きいほうを要ったときに
 * そこで足す —— 使われないモードを先に書くと、実際に使う日まで誰も
 * 正しさを確かめられない。
 */
const ProfileCard: Component<{ pubkey: string }> = (props) => {
  const ctx = useRender();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);

  const displayName = () =>
    profile()?.displayName || profile()?.name || npubLabel(props.pubkey);
  const domain = () => {
    const nip05 = profile()?.nip05;
    return nip05 ? nip05Domain(nip05) : undefined;
  };
  const website = () => {
    const url = profile()?.website;
    return url && isHttpUrl(url) ? url : undefined;
  };

  return (
    <div
      data-testid="profile-card"
      class="grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)]"
    >
      {/*
        画像が落ちても枠は残す (`Avatar` と同じ判断) —— 枠が消えると
        カードの高さが後から縮み、下の行が飛ぶ。
      */}
      <div class="mb--16 max-h-24 w-full select-none overflow-hidden bg-secondary">
        <Show when={profile()?.banner && !bannerBroken()}>
          <img
            data-testid="profile-banner"
            src={profile()?.banner}
            alt=""
            loading="lazy"
            class="h-full w-full object-cover"
            onError={() => setBannerBroken(true)}
          />
        </Show>
      </div>

      <div class="flex w-full flex-col gap-1 overflow-hidden p-2">
        <div class="relative mt-24">
          <div class="absolute bottom-0 aspect-square h-24 w-auto shrink-0 select-none overflow-hidden rounded bg-secondary">
            <Show when={profile()?.picture && !pictureBroken()}>
              <img
                data-testid="profile-picture"
                src={profile()?.picture}
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
                onError={() => setPictureBroken(true)}
              />
            </Show>
          </div>
        </div>

        <div class="flex flex-col">
          <span
            data-testid="profile-card-name"
            class="line-clamp-3 text-ellipsis font-700 text-h3"
          >
            {displayName()}
          </span>
          <Show when={profile()?.name}>
            {(name) => (
              <span class="c-secondary truncate text-caption">@{name()}</span>
            )}
          </Show>
        </div>

        <div class="flex w-full flex-wrap gap-2">
          {/*
            **検証していないので検証済みの見た目にしない** (仕様 3.1 節)。
            v0 が検証前に出しているのと同じ「未検証」の印を出す。
          */}
          <Show when={domain()}>
            {(value) => (
              <div data-testid="profile-nip05" class="flex items-center gap-1">
                <div class="i-material-symbols:question-mark-rounded c-secondary aspect-square h-0.75lh w-auto" />
                <div class="c-secondary text-caption">{value()}</div>
              </div>
            )}
          </Show>
          <Show when={website()}>
            {(url) => (
              <div class="flex max-w-full items-center gap-1">
                <div class="i-material-symbols:link-rounded c-secondary aspect-square h-0.75lh w-auto" />
                <a
                  data-testid="profile-website"
                  href={url()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate text-caption text-link"
                >
                  {url()}
                </a>
              </div>
            )}
          </Show>
        </div>

        {/*
          `about` は本文と同じトークナイザで描く —— NIP-30 のカスタム絵文字は
          kind:0 の `name`/`about` にも適用される (v0 はタグを捨てていて
          効いていない)。`compact` なので画像はインライン展開しない。
          イベント参照はテキストで残す —— カードに引用カードを生やすと
          360px の枠が他人のノートで埋まる。
        */}
        <Show when={profile()?.about}>
          {(about) => (
            <div class="overflow-y-auto">
              <NoteContent
                content={about()}
                tags={profile()?.tags ?? []}
                variant="compact"
                eventRefs="text"
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default ProfileCard;
