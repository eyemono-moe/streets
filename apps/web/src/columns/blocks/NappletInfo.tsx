import { fetchVerifiedBlob } from "@streets/core/napplet/artifact";
import { type Component, createResource, onCleanup } from "solid-js";
import NappletInfoView from "../../napplet/NappletInfoView";
import { STREETS_NAPPLET_DOMAINS } from "../../napplet/streets-host";
import { createNappletManifest } from "./napplet-manifest";

const SUPPORTED: ReadonlySet<string> = new Set(STREETS_NAPPLET_DOMAINS);

/** napplet の情報を読む。アイコンは作者のサーバーから取り、ハッシュを照合してから出す。 */
const NappletInfo: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
}> = (props) => {
  const { lookup, manifest } = createNappletManifest({
    pubkey: () => props.pubkey,
    identifier: () => props.identifier,
    relays: () => props.relays,
  });
  // NIP-5D: > Clients MUST render the verified bytes rather than an unverified remote URL.
  // 照合した中身を blob の URL にして出す。画像として読めなければ <img> が出ないだけで、
  // napplet の読み込みは止めない。
  const [iconUrl] = createResource(
    () => manifest()?.icon && manifest(),
    async (current) => {
      if (!current.icon) return undefined;
      const result = await fetchVerifiedBlob(
        current.icon.hash,
        current.servers,
        globalThis.fetch.bind(globalThis),
      );
      if (!result.ok) return undefined;
      if (shown) URL.revokeObjectURL(shown);
      shown = URL.createObjectURL(
        new Blob([result.bytes as BlobPart], { type: current.icon.mime }),
      );
      return shown;
    },
  );
  let shown: string | undefined;
  onCleanup(() => {
    if (shown) URL.revokeObjectURL(shown);
  });
  return (
    <NappletInfoView
      lookup={lookup()}
      iconUrl={iconUrl()}
      supported={SUPPORTED}
    />
  );
};

export default NappletInfo;
