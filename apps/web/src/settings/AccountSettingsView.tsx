import { profileEmojiTags } from "@streets/core/nostr/build/references";
import {
  type Nip05Status,
  nip05Label,
  nip05Status,
  parseNip05,
} from "@streets/core/nostr/nip05";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  type ProfileEditState,
  type ProfileField,
  isProfileDirty,
  profileErrors,
  profileFromDraft,
} from "@streets/core/settings/profile-edit";
import {
  type Accessor,
  type Component,
  type JSX,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import {
  useEmojiSource,
  useUserCandidates,
  userSource,
} from "../completion/sources";
import { useEmojiLookup } from "../emoji/custom-emojis";
import ImageUrlField from "../media/ImageUrlField";
import { useNip05Lookup } from "../profile/nip05";
import { Nip05View } from "../profile/Nip05Badge";
import { ProfileHeaderCard } from "../profile/ProfileHeaderView";
import { Mediates, useDispatch } from "../ui-events";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
import { settings, type SettingId } from "./setting-registry";
import { useSettingFilter } from "./SettingFilter";
import SettingsSection from "./SettingsSection";

export type AccountSettingsViewProps = {
  pubkey: string;
  state: ProfileEditState;
  /** 書きかけのまま閉じようとした回数。増えたら保存の欄を見せて揺らす。 */
  attention?: number;
};

/** アカウントの設定。プロフィールの書きかけを受け取って描き、変えたらイベントを上へ渡す。 */
const AccountSettingsView: Component<AccountSettingsViewProps> = (props) => {
  const dispatch = useDispatch();
  const filter = useSettingFilter();
  const visible = (id: SettingId) => !filter || filter() === id;
  const errors = () => profileErrors(props.state.draft);
  const dirty = () => isProfileDirty(props.state);
  // 画像を上げている間は保存させない。上げ終わる前に保存すると、画像の無いプロフィールになる。
  const [uploads, setUploads] = createSignal(0);
  const countUpload = (uploading: boolean) =>
    setUploads((count) => count + (uploading ? 1 : -1));
  const canSave = () =>
    dirty() &&
    !props.state.saving &&
    uploads() === 0 &&
    Object.keys(errors()).length === 0;
  const nip05 = createNip05Check(
    () => props.pubkey,
    () => props.state,
  );

  // 閉じようとして止められたら、保存の欄まで送って揺らし、文言を強める。
  let actions: HTMLDivElement | undefined;
  const [shaking, setShaking] = createSignal(false);
  const [warned, setWarned] = createSignal(false);
  createEffect(
    on(
      () => props.attention ?? 0,
      (count) => {
        if (count === 0) return;
        setWarned(true);
        // 別のページから切り替わってきたときは、まだページが描かれていない。
        // 描き終えてから送り、揺らす。続けて閉じようとしても揺れるよう、いったん外す。
        setShaking(false);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            actions?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            setShaking(true);
          }),
        );
      },
    ),
  );
  createEffect(() => {
    if (!dirty()) setWarned(false);
  });

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        id="profile"
        scope="account"
        description="ほかの人に見える名前やアイコンです。ほかのアプリでも同じプロフィールが表示されます。"
      >
        <Show when={!filter}>
          <ProfilePreview
            pubkey={props.pubkey}
            state={props.state}
            nip05={nip05}
          />
        </Show>
        <form
          class="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave()) dispatch({ type: "profile/save" });
          }}
        >
          <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <Show when={visible("profileDisplayName")}>
              <ProfileInput
                field="display_name"
                state={props.state}
                emoji
                label={settings.profileDisplayName.title}
                placeholder="例：わたし"
              />
            </Show>
            <Show when={visible("profileName")}>
              <ProfileInput
                field="name"
                state={props.state}
                emoji
                label={settings.profileName.title}
                placeholder="例：me"
                hint="表示名の下に @ を付けて出ます。"
              />
            </Show>
          </div>
          <Show when={visible("profileAbout")}>
            <ProfileInput
              field="about"
              state={props.state}
              emoji
              mention
              label={settings.profileAbout.title}
              multiline
            />
          </Show>
          {/* 見本とボタンが並ぶので、2 列に割らず 1 行を使う。 */}
          <Show when={visible("profilePicture")}>
            <ProfileImageInput
              field="picture"
              state={props.state}
              label={settings.profilePicture.title}
              aspectRatio={1}
              onUploading={countUpload}
              preview={(url) => (
                <Avatar
                  pubkey={props.pubkey}
                  picture={url}
                  class="size-9 rounded-2"
                />
              )}
            />
          </Show>
          <Show when={visible("profileBanner")}>
            <ProfileImageInput
              field="banner"
              state={props.state}
              label={settings.profileBanner.title}
              onUploading={countUpload}
              preview={(url) => <BannerThumb url={url} />}
            />
          </Show>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <Show when={visible("profileNip05")}>
              <ProfileInput
                field="nip05"
                state={props.state}
                onBlur={nip05.check}
                status={<Nip05CheckResult check={nip05} />}
                label={settings.profileNip05.title}
                type="email"
                placeholder="name@example.com"
                hint={
                  <>
                    持っているドメインで、このアカウントが自分のものだと示せます。
                    <a
                      class="text-link"
                      href="https://welcome.nostr-jp.org/tutorial/nip-05.html"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      NIP-05 とは？
                    </a>
                  </>
                }
              />
            </Show>
            <Show when={visible("profileWebsite")}>
              <ProfileInput
                field="website"
                state={props.state}
                label={settings.profileWebsite.title}
                type="url"
                placeholder="https://"
              />
            </Show>
            <Show when={visible("profileLud16")}>
              <ProfileInput
                field="lud16"
                state={props.state}
                label={settings.profileLud16.title}
                type="email"
                placeholder="name@wallet.example"
                hint="Zap（ビットコインでの投げ銭）を受け取るウォレットのアドレスです。ウォレットのアプリに表示されています。空欄なら、あなたの投稿に Zap は送れません。"
              />
            </Show>
          </div>
          {/* 案内の文は 1 行を使い、ボタンはその下に右寄せで並べる。横に並べると、
              ボタンの幅に押されて文が中途半端な位置で折り返す。 */}
          <div
            ref={actions}
            class="flex scroll-m-4 flex-col items-stretch gap-2"
            classList={{ "animate-shake": shaking() }}
            onAnimationEnd={() => setShaking(false)}
          >
            <Show when={dirty()}>
              <p
                class="text-caption"
                classList={{
                  "c-secondary": !warned(),
                  "c-danger font-600": warned(),
                }}
                role={warned() ? "alert" : undefined}
              >
                {warned()
                  ? "保存していない変更があります。保存するか、元に戻してから閉じてください"
                  : "保存するまで、ほかの人には反映されません"}
              </p>
            </Show>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Show when={dirty()}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={props.state.saving}
                  onClick={() => dispatch({ type: "profile/reset" })}
                >
                  元に戻す
                </Button>
              </Show>
              <Button
                type="submit"
                variant={props.state.saving ? "muted" : "primary"}
                disabled={!canSave()}
              >
                {props.state.saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        id="accountId"
        description="ほかの人にあなたを教えるときや、ほかのアプリで同じアカウントを使うときの目印です。"
      >
        <AccountId pubkey={props.pubkey} />
      </SettingsSection>

      <Show when={!filter}>
        <section class="flex flex-col items-start gap-2 border-primary border-t pt-5">
          <Button
            variant="danger"
            icon="i-material-symbols:logout-rounded"
            onClick={() => dispatch({ type: "deck/logout" })}
          >
            この端末からログアウト
          </Button>
          <p class="c-secondary text-caption">
            プロフィールやデッキは消えません。もう一度ログインすれば、元のとおりに使えます。
          </p>
        </section>
      </Show>
    </div>
  );
};

type Nip05Check = ReturnType<typeof createNip05Check>;

/**
 * 設定の NIP-05 をドメインに確かめる。打つたびには聞かず、欄から離れたときに
 * 聞く。同じ値で離れ直したら聞き直す —— ドメイン側を直してから確かめ直せるように。
 * 読み取った版は、開いたときに確かめておく。
 */
const createNip05Check = (
  pubkey: Accessor<string>,
  state: Accessor<ProfileEditState>,
) => {
  const [checked, setChecked] = createSignal("");
  createEffect(on(() => state().base.nip05.trim(), setChecked));
  const address = createMemo(() => parseNip05(checked()));
  const lookup = useNip05Lookup(address);
  const draft = () => state().draft.nip05.trim();
  /** 聞いた答えが、いま欄にある値のものか。打ちかけの値に古い答えを出さない。 */
  const current = () => address() !== undefined && draft() === checked();
  return {
    check: () => {
      if (profileErrors(state().draft).nip05 !== undefined) return;
      if (draft() === checked()) void lookup.refetch();
      else setChecked(draft());
    },
    address,
    lookup,
    current,
    pubkey,
    previewStatus: (): Nip05Status =>
      current() && !lookup.isFetching
        ? nip05Status(lookup.data, pubkey())
        : "pending",
  };
};

/** 欄の下に出す、ドメインに聞いた答え。直すための手がかりを添える。 */
const Nip05CheckResult: Component<{ check: Nip05Check }> = (props) => {
  const lookup = () => props.check.lookup.data;
  const name = () => props.check.address()?.name ?? "";
  const domain = () => props.check.address()?.domain ?? "";
  return (
    <Show when={props.check.current()}>
      <Switch>
        <Match when={props.check.lookup.isFetching}>
          <p class="c-secondary text-caption">ドメインに確認しています…</p>
        </Match>
        <Match
          when={nip05Status(lookup(), props.check.pubkey()) === "verified"}
        >
          <p class="c-accent-5 flex items-center gap-1 text-caption">
            <span class="i-material-symbols:verified-rounded size-[1.15em] shrink-0" />
            ドメインで本人と確認できました
          </p>
        </Match>
        <Match when={lookup()?.kind === "found"}>
          <p class="c-danger text-caption">
            このドメインには、別のアカウントが「{name()}
            」として登録されています。
            {domain()} の nostr.json で「{name()}
            」に書く公開鍵を、このアカウントのもの（hex）にしてください
          </p>
        </Match>
        <Match when={lookup()?.kind === "missing"}>
          <p class="c-danger text-caption">
            {domain()} の nostr.json に「{name()}
            」が登録されていません。名前の綴りか、nostr.json
            の中身を確かめてください
          </p>
        </Match>
        <Match when={lookup()?.kind === "unreachable"}>
          <p class="c-danger break-anywhere text-caption">
            確認できませんでした。アドレスが合っているか、https://{domain()}
            /.well-known/nostr.json
            をほかのサイトから読めるようになっているか（CORS
            の設定）を確かめてください
          </p>
        </Match>
      </Switch>
    </Show>
  );
};

/** ヘッダー画像の小さな見本。読めない URL は、壊れた画像の印を出さず空の枠にする。 */
const BannerThumb: Component<{ url: string | undefined }> = (props) => {
  const [broken, setBroken] = createSignal<string>();
  return (
    <span class="block h-9 w-16 shrink-0 overflow-hidden rounded-2 bg-secondary">
      <Show when={props.url !== broken() && props.url}>
        {(url) => (
          <img
            src={url()}
            alt=""
            class="size-full object-cover"
            decoding="async"
            onError={() => setBroken(url())}
          />
        )}
      </Show>
    </span>
  );
};

/** プロフィールの画像の項目。URL を書くか、画像を選んでアップロードする。 */
const ProfileImageInput: Component<{
  field: "picture" | "banner";
  state: ProfileEditState;
  label: string;
  aspectRatio?: number;
  onUploading: (uploading: boolean) => void;
  preview: (url: string | undefined) => JSX.Element;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <ImageUrlField
      label={props.label}
      value={props.state.draft[props.field]}
      error={profileErrors(props.state.draft)[props.field]}
      aspectRatio={props.aspectRatio}
      disabled={props.state.saving}
      preview={props.preview}
      onUploading={props.onUploading}
      onChange={(value) =>
        dispatch({ type: "profile/input", field: props.field, value })
      }
    />
  );
};

/** プロフィールの 1 項目。書きかけの値と誤りを読み、打ったらイベントを上へ渡す。 */
const ProfileInput: Component<{
  field: ProfileField;
  state: ProfileEditState;
  label: string;
  placeholder?: string;
  hint?: JSX.Element;
  multiline?: boolean;
  type?: "text" | "url" | "email";
  /** 名前や自己紹介のように、スタンプを入れられる項目か（NIP-30）。 */
  emoji?: boolean;
  /** 自己紹介のように、人を指せる項目か。読む側で `nostr:` が人へのリンクになる。 */
  mention?: boolean;
  onBlur?: () => void;
  status?: JSX.Element;
}> = (props) => {
  const dispatch = useDispatch();
  const emojiSource = useEmojiSource();
  const userCandidates = useUserCandidates();
  const completion = () => [
    ...(props.mention
      ? [
          userSource(userCandidates, {
            format: (nprofile) => `nostr:${nprofile}`,
            space: true,
          }),
        ]
      : []),
    ...(props.emoji ? [emojiSource] : []),
  ];
  return (
    <TextField
      completion={completion()}
      label={props.label}
      placeholder={props.placeholder}
      hint={props.hint}
      multiline={props.multiline}
      type={props.type}
      value={props.state.draft[props.field]}
      error={profileErrors(props.state.draft)[props.field]}
      onBlur={props.onBlur}
      status={props.status}
      onInput={(value) =>
        dispatch({ type: "profile/input", field: props.field, value })
      }
    />
  );
};

/**
 * 書きかけのままのプロフィールを、ユーザーのカラムの先頭と同じ部品・同じ幅で
 * 見せる。保存したらほかの人にどう見えるかを、そのまま確かめられる。
 */
const ProfilePreview: Component<{
  pubkey: string;
  state: ProfileEditState;
  nip05: Nip05Check;
}> = (props) => {
  const emoji = useEmojiLookup();
  // 書きかけの :shortcode: も、保存したときと同じく絵文字で見せる。
  const tags = () => profileEmojiTags([], props.state.draft, emoji);
  return (
    <div class="flex flex-col gap-1.5">
      <span class="c-secondary text-caption">カラムでの見え方</span>
      <div class="w-full max-w-[380px] overflow-hidden rounded-3 border border-primary [&>section]:border-b-0">
        {/* 見え方を確かめるだけなので、自己紹介の中の人やノートを押してもカラムは開かない。 */}
        <Mediates handle={(event) => event.type === "stack/open"}>
          <ProfileHeaderCard
            pubkey={props.pubkey}
            profile={profileFromDraft(props.state.draft)}
            profileTags={tags()}
            nip05={
              <Show when={parseNip05(props.state.draft.nip05)}>
                {(address) => (
                  <div class="mt-1 flex min-w-0">
                    <Nip05View
                      label={nip05Label(address())}
                      status={props.nip05.previewStatus()}
                    />
                  </div>
                )}
              </Show>
            }
          />
        </Mediates>
      </div>
    </div>
  );
};

const AccountId: Component<{ pubkey: string }> = (props) => {
  const npub = () => encodeBech32("npub", props.pubkey);
  const [copied, setCopied] = createSignal<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(npub());
      setCopied("コピーしました");
    } catch {
      // 非セキュアな接続や権限拒否で失敗する。黙って何も起きないと壊れて見える。
      setCopied("コピーできませんでした");
    }
    clearTimeout(timer);
    timer = setTimeout(() => setCopied(undefined), 2500);
  };
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-2 border border-primary p-3">
      <code class="c-primary min-w-0 flex-1 break-all text-caption">
        {npub()}
      </code>
      <Button
        variant="secondary"
        size="sm"
        icon="i-material-symbols:content-copy-outline-rounded"
        onClick={() => void copy()}
      >
        {copied() ?? "コピー"}
      </Button>
    </div>
  );
};

export default AccountSettingsView;
