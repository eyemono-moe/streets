import { type Component, Show, createSignal } from "solid-js";
import { useRender } from "../../core/view/render-context";
import NoteContent from "./NoteContent";
import { npubLabel } from "./npub-label";
import { useProfileData } from "./profile-data";
import { ProfileHoverSuppressedProvider } from "./profile-hover-context";

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
 * kind:0 を面として描く。**取得経路を増やさない** —— 著者名・アイコンが
 * 既に要求済みの著者ならホバーで通信は増えないが、未取得なら再要求される。
 */
const ProfileCard: Component<{ pubkey: string }> = (props) => {
  const ctx = useRender();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);

  const rawDisplayName = () => profile()?.displayName;
  const name = () => profile()?.name;
  const displayName = () =>
    rawDisplayName() || name() || npubLabel(props.pubkey);
  const domain = () => {
    const nip05 = profile()?.nip05;
    return nip05 ? nip05Domain(nip05) : undefined;
  };
  // `website` は在れば行を必ず出す。`http(s)` のときだけ
  // リンクにし、それ以外は素のテキストで出す —— スキーム無し
  // (`example.com` のような実データで多い形) を非 http(s) と同じに
  // 落として行ごと消すと、素のテキストとして出すという扱いにならない。
  const website = () => profile()?.website;

  return (
    <div
      data-testid="profile-card"
      class="grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)]"
    >
      {/*
        画像が落ちても枠は残す —— 消えるとカードの高さが縮み下の行が飛ぶ。
        banner は横幅いっぱいで `aspect-*` が使えず、`max-h-24` (上限) だと
        `<img>` 未描画時に高さ 0 になるので `h-24` (固定) にする。
      */}
      <div class="mb--16 h-24 w-full select-none overflow-hidden bg-secondary">
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
          {/*
            `@name` は太字側が `display_name` を出せているときだけ添える
            (`Profile.tsx` と同じ規則) —— `display_name` が無い kind:0 では
            太字側が `name` へ落ちるので、両方出すと同じ文字列が 2 度並ぶ。
          */}
          <Show when={rawDisplayName() && name()}>
            <span class="c-secondary truncate text-caption">@{name()}</span>
          </Show>
        </div>

        <div class="flex w-full flex-wrap gap-2">
          {/*
            **検証していないので検証済みの見た目にしない。**
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
                <Show
                  when={isHttpUrl(url())}
                  fallback={
                    <span
                      data-testid="profile-website"
                      class="truncate text-caption"
                    >
                      {url()}
                    </span>
                  }
                >
                  <a
                    data-testid="profile-website"
                    href={url()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate text-caption text-link"
                  >
                    {url()}
                  </a>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/*
          `about` は本文と同じトークナイザで描く —— NIP-30 のカスタム絵文字は
          kind:0 の `name`/`about` にも適用される。`compact` なので画像は
          インライン展開しない。イベント参照はテキストで残す —— カードに
          引用カードを生やすと 360px の枠が他人のノートで埋まる。
        */}
        <Show when={profile()?.about}>
          {(about) => (
            <div class="overflow-y-auto">
              {/*
                  自己紹介文が `nostr:npub` を含むとカード内カードになるので
                  抑止する。**カード全体でなくここだけを包む** —— ルートを
                  provider にすると戻り値が DOM 要素でなくなる。
                */}
              <ProfileHoverSuppressedProvider value={true}>
                <NoteContent
                  content={about()}
                  tags={profile()?.tags ?? []}
                  variant="compact"
                  eventRefs="text"
                />
              </ProfileHoverSuppressedProvider>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default ProfileCard;
