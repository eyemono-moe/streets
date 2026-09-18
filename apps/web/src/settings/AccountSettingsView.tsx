import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  type ProfileEditState,
  type ProfileField,
  isProfileDirty,
  profileErrors,
  profileFromDraft,
} from "@streets/core/settings/profile-edit";
import {
  type Component,
  type JSX,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { ProfileHeaderCard } from "../profile/ProfileHeaderView";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
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
  const errors = () => profileErrors(props.state.draft);
  const dirty = () => isProfileDirty(props.state);
  const canSave = () =>
    dirty() && !props.state.saving && Object.keys(errors()).length === 0;

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
            <ProfileInput
              field="website"
              state={props.state}
              label="Web サイト"
              type="url"
              placeholder="https://"
            />
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
  hint?: JSX.Element;
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

/**
 * 書きかけのままのプロフィールを、ユーザーのカラムの先頭と同じ部品・同じ幅で
 * 見せる。保存したらほかの人にどう見えるかを、そのまま確かめられる。
 */
const ProfilePreview: Component<{ pubkey: string; state: ProfileEditState }> = (
  props,
) => (
  <div class="flex flex-col gap-1.5">
    <span class="c-secondary text-caption">カラムでの見え方</span>
    <div
      class="w-full max-w-[380px] overflow-hidden rounded-3 border border-primary [&>section]:border-b-0"
      aria-hidden="true"
    >
      <ProfileHeaderCard
        pubkey={props.pubkey}
        profile={profileFromDraft(props.state.draft)}
      />
    </div>
  </div>
);

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
