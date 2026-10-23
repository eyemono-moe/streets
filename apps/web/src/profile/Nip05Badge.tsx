import {
  type Nip05Status,
  nip05Label,
  nip05Status,
  parseNip05,
} from "@streets/core/nostr/nip05";
import { type Component, Show, createMemo } from "solid-js";
import { t } from "../i18n/locale";
import { useNip05Lookup } from "./nip05";

// 確かめている間と聞けなかったときは同じ中立の印にする。取得中を失敗に見せず、
// 聞けなかっただけのものを「認められていない」とも見せない。
const ICONS: Record<Nip05Status, string> = {
  pending: "i-material-symbols:alternate-email-rounded c-secondary",
  verified: "i-material-symbols:verified-rounded c-accent-5",
  mismatch: "i-material-symbols:error-rounded c-danger",
  unreachable: "i-material-symbols:alternate-email-rounded c-secondary",
};

/** ドメインでの本人確認（NIP-05）の見た目。確かめた結果を受け取って描くだけ。 */
export const Nip05View: Component<{ label: string; status: Nip05Status }> = (
  props,
) => (
  <span
    class="flex min-w-0 items-center gap-1 text-caption"
    title={t(`profile.nip05.${props.status}`)}
  >
    <span
      role="img"
      aria-label={t(`profile.nip05.${props.status}`)}
      class={`size-[1.15em] shrink-0 ${ICONS[props.status]}`}
    />
    <span class="c-secondary min-w-0 truncate">{props.label}</span>
  </span>
);

/** kind:0 に書かれた NIP-05 をドメインに確かめて出す。読めない値なら何も出さない。 */
const Nip05Badge: Component<{ pubkey: string; nip05: string | undefined }> = (
  props,
) => {
  const address = createMemo(() =>
    props.nip05 === undefined ? undefined : parseNip05(props.nip05),
  );
  const lookup = useNip05Lookup(address);
  return (
    <Show when={address()}>
      {(address) => (
        <Nip05View
          label={nip05Label(address())}
          status={nip05Status(lookup.data, props.pubkey)}
        />
      )}
    </Show>
  );
};

export default Nip05Badge;
