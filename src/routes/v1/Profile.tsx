import type { Component } from "solid-js";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { useProfileData } from "./profile-data";

export type ProfileProps = {
  pubkey: string;
  store: EventStore;
  requests: ProfileRequests;
};

/**
 * 1 人分の名前を出す (アイコンは `Avatar.tsx` が別領域として担う ——
 * spec 3 節)。取得ロジックは `<Avatar>` と共有 (`profile-data.ts`):
 * マウント時に自分の pubkey を `requests.request()` で 1 件だけ要求する ——
 * カラム側で著者集合をまとめるのではなく、ここが要求の最小単位 (spec 4 節)。
 * まとめるのはコアレッサ (`profile-requests.ts`) の仕事であり、この
 * コンポーネントは他の `<Profile>`/`<Avatar>` の存在を一切知らない。
 *
 * まだプロフィールが無い間は短縮 pubkey を出す (**空欄にしない** —— 注意 2)。
 */
const Profile: Component<ProfileProps> = (props) => {
  const profile = useProfileData(
    () => props.pubkey,
    props.store,
    props.requests,
  );

  const shortPubkey = () => `${props.pubkey.slice(0, 8)}…`;

  return (
    <span data-testid="profile">
      <span data-testid="profile-name" class="break-all">
        {profile()?.name || shortPubkey()}
      </span>
    </span>
  );
};

export default Profile;
