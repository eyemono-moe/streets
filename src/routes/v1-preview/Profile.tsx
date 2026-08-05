import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";

export type ProfileProps = {
  pubkey: string;
  store: EventStore;
  requests: ProfileRequests;
};

type ParsedProfile = {
  name?: string;
  picture?: string;
};

/**
 * kind:0 の `content` (JSON 文字列) をパースする。リレーから来た値であり
 * `EventStore` は形を保証しない (task-5-brief の注意 1) —— JSON として壊れて
 * いても、`name`/`picture` の型が期待と違っても (数値・オブジェクトなど)、
 * 例外を投げずに安全側の `undefined` へ倒す。
 */
const parseProfileContent = (content: string): ParsedProfile | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    picture: typeof record.picture === "string" ? record.picture : undefined,
  };
};

/**
 * 1 人分のプロフィール (名前・アイコン) を出す。マウント時に自分の pubkey を
 * `requests.request()` で 1 件だけ要求する —— カラム側で著者集合をまとめる
 * のではなく、ここが要求の最小単位 (spec 4 節)。まとめるのはコアレッサ
 * (`profile-requests.ts`) の仕事であり、このコンポーネントは他の
 * `<Profile>` の存在を一切知らない。
 *
 * まだプロフィールが無い間は短縮 pubkey を出す (**空欄にしない** —— 注意 2)。
 */
const Profile: Component<ProfileProps> = (props) => {
  const [profile, setProfile] = createSignal<ParsedProfile | undefined>();

  createEffect(() => {
    // 依存として追跡するのは props.pubkey だけ —— この中で `profile` 自身を
    // 読んで分岐すると、setProfile がこの effect を再実行させ、そこでまた
    // 同じ値 (だが新しい参照) を set し直して無限ループになる。読むのを
    // `pubkey` だけに絞ることでその罠を避ける。
    const pubkey = props.pubkey;
    let resolved = false;

    const check = (): boolean => {
      const event = props.store.latestReplaceable(0, pubkey);
      if (!event) return false;
      setProfile(parseProfileContent(event.content));
      return true;
    };

    if (check()) return; // 既に EventStore にある — 要求もリスンも不要

    props.requests.request(pubkey);
    const unsubscribe = props.requests.subscribe(() => {
      // 無関係なバッチの完了でも呼ばれる (コアレッサは pubkey 単位で通知
      // しない) —— その場合 check() は false を返すだけで再描画は起きない。
      if (resolved) return;
      if (check()) {
        resolved = true;
        unsubscribe();
      }
    });
    onCleanup(unsubscribe);
  });

  const shortPubkey = () => `${props.pubkey.slice(0, 8)}…`;

  return (
    <span data-testid="profile" class="inline-flex items-center gap-1">
      <Show when={profile()?.picture}>
        {(picture) => (
          <img
            src={picture()}
            alt=""
            class="h-4 w-4 shrink-0 rounded-full object-cover"
          />
        )}
      </Show>
      <span data-testid="profile-name" class="break-all">
        {profile()?.name || shortPubkey()}
      </span>
    </span>
  );
};

export default Profile;
