import { encodeBech32 } from "@streets/core/nostr/nip19";
import { shortNpub } from "@streets/core/nostr/profile";
import {
  type ProfileEditState,
  type ProfileField,
  isProfileDirty,
  profileErrors,
} from "@streets/core/settings/profile-edit";
import { type Component, Show, createSignal, onCleanup } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
import SettingsSection from "./SettingsSection";

export type AccountSettingsViewProps = {
  pubkey: string;
  state: ProfileEditState;
};

/** アカウントの設定。プロフィールの書きかけを受け取って描き、変えたらイベントを上へ渡す。 */
const AccountSettingsView: Component<AccountSettingsViewProps> = (props) => {
  const dispatch = useDispatch();
  const errors = () => profileErrors(props.state.draft);
  const dirty = () => isProfileDirty(props.state);
  const canSave = () =>
    dirty() && !props.state.saving && Object.keys(errors()).length === 0;

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="プロフィール"
        scope="account"
        description="ほかの人に見える名前やアイコンです。ほかのアプリでも同じプロフィールが表示されます。"
      >
        <ProfilePreview pubkey={props.pubkey} state={props.state} />
        <form
          class="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave()) dispatch({ type: "profile/save" });
          }}
        >
          <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <ProfileInput
              field="display_name"
              state={props.state}
              label="表示名"
              placeholder="例：わたし"
            />
            <ProfileInput
              field="name"
              state={props.state}
              label="ユーザー名"
              placeholder="例：me"
              hint="表示名の下に @ を付けて出ます。"
            />
          </div>
          <ProfileInput
            field="about"
            state={props.state}
            label="自己紹介"
            multiline
          />
          <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <ProfileInput
              field="picture"
              state={props.state}
              label="アイコン画像の URL"
              type="url"
              placeholder="https://"
            />
            <ProfileInput
              field="banner"
              state={props.state}
              label="ヘッダー画像の URL"
              type="url"
              placeholder="https://"
            />
            <ProfileInput
              field="nip05"
              state={props.state}
              label="ドメインでの本人確認（NIP-05）"
              type="email"
              placeholder="name@example.com"
              hint="持っているドメインで、このアカウントが自分のものだと示せます。"
            />
            <ProfileInput
              field="website"
              state={props.state}
              label="Web サイト"
              type="url"
              placeholder="https://"
            />
          </div>
          <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <Show when={dirty()}>
              <span class="c-secondary mr-auto text-caption">
                保存するまで、ほかの人には反映されません
              </span>
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
        </form>
      </SettingsSection>

      <SettingsSection
        title="あなたの ID"
        description="ほかの人にあなたを教えるときや、ほかのアプリで同じアカウントを使うときの目印です。"
      >
        <AccountId pubkey={props.pubkey} />
      </SettingsSection>

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
    </div>
  );
};

/** プロフィールの 1 項目。書きかけの値と誤りを読み、打ったらイベントを上へ渡す。 */
const ProfileInput: Component<{
  field: ProfileField;
  state: ProfileEditState;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  type?: "text" | "url" | "email";
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <TextField
      label={props.label}
      placeholder={props.placeholder}
      hint={props.hint}
      multiline={props.multiline}
      type={props.type}
      value={props.state.draft[props.field]}
      error={profileErrors(props.state.draft)[props.field]}
      onInput={(value) =>
        dispatch({ type: "profile/input", field: props.field, value })
      }
    />
  );
};

/** 書きかけのままのプロフィールの見た目。保存する前に確かめられる。 */
const ProfilePreview: Component<{ pubkey: string; state: ProfileEditState }> = (
  props,
) => {
  const draft = () => props.state.draft;
  const [bannerBroken, setBannerBroken] = createSignal<string>();
  const [pictureBroken, setPictureBroken] = createSignal<string>();
  const banner = () => {
    const url = draft().banner.trim();
    return url && url !== bannerBroken() ? url : undefined;
  };
  const picture = () => {
    const url = draft().picture.trim();
    return url && url !== pictureBroken() ? url : undefined;
  };
  const name = () =>
    draft().display_name.trim() ||
    draft().name.trim() ||
    shortNpub(props.pubkey);

  return (
    <div
      class="overflow-hidden rounded-3 border border-primary"
      aria-hidden="true"
    >
      <div class="h-16 bg-tertiary">
        <Show when={banner()}>
          {(url) => (
            <img
              src={url()}
              alt=""
              class="size-full object-cover"
              onError={() => setBannerBroken(url())}
            />
          )}
        </Show>
      </div>
      <div class="flex items-end gap-3 px-3 pb-3">
        <div class="-mt-7 size-14 shrink-0 overflow-hidden rounded-3 border-3 border-white bg-secondary dark:border-ui-950">
          <Show when={picture()}>
            {(url) => (
              <img
                src={url()}
                alt=""
                class="size-full object-cover"
                onError={() => setPictureBroken(url())}
              />
            )}
          </Show>
        </div>
        <div class="flex min-w-0 flex-col">
          <span class="c-primary truncate font-600 text-body">{name()}</span>
          <Show when={draft().name.trim()}>
            {(handle) => (
              <span class="c-secondary truncate text-caption">@{handle()}</span>
            )}
          </Show>
        </div>
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
