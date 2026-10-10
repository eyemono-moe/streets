import {
  type BlobDescriptor,
  UploadFailedError,
  buildUploadAuth,
  hashBytes,
  uploadBlob,
} from "@streets/core/media/blossom";
import { uploadNip96 } from "@streets/core/media/nip96";
import type { UploadServer } from "@streets/core/media/upload-servers";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Signer } from "@streets/core/signer/signer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";
import { uploadMetadata } from "./metadata";

export class NoUploadServerError extends Error {
  constructor() {
    super("画像のアップロード先が設定されていません");
    this.name = "NoUploadServerError";
  }
}

export type Uploader = {
  /** アップロード先。1 つも無ければ、画像を添える操作を出さない。 */
  servers: Accessor<readonly UploadServer[]>;
  upload: (file: File) => Promise<BlobDescriptor>;
};

const UploaderContext = createContext<Uploader>();

/**
 * 画像などを Blossom か NIP-96 のサーバーへアップロードする。設定の並び順に試し、最初に
 * 受け取ってくれたところの URL を使う（1 つのサーバーが落ちていてもアップロードできる）。
 */
export const createUploader = (options: {
  signer: Signer;
  viewer: string;
  servers: Accessor<readonly UploadServer[]>;
  now?: () => number;
}): Uploader => ({
  servers: options.servers,
  upload: async (file) => {
    const servers = options.servers();
    if (servers.length === 0) throw new NoUploadServerError();
    // 動画のフレーム待ちはアップロードと並行させる。
    const metadata = uploadMetadata(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = hashBytes(bytes);
    const nowSeconds = () => Math.floor((options.now?.() ?? Date.now()) / 1000);
    // 認可はファイルの中身に結び付く（BUD-01）ので、1 回署名すればどの Blossom のサーバーにも
    // 使える。NIP-96 しか試さないなら署名させない。
    let blossomAuth: Promise<NostrEvent> | undefined;
    const signBlossomAuth = () => {
      const created = nowSeconds();
      blossomAuth ??= options.signer.signEvent({
        ...buildUploadAuth({ sha256, name: file.name, nowSeconds: created }),
        pubkey: options.viewer,
        created_at: created,
      });
      return blossomAuth;
    };

    let lastError: unknown;
    for (const server of servers) {
      try {
        const blob =
          server.protocol === "blossom"
            ? await uploadBlob({
                server: server.url,
                bytes,
                type: file.type || undefined,
                auth: await signBlossomAuth(),
              })
            : // NIP-98 の認可は宛先ごとで、作った時刻から 60 秒ほどしか通らないので都度作る。
              await uploadNip96({
                server: server.url,
                bytes,
                sha256,
                name: file.name,
                type: file.type || undefined,
                sign: (draft) =>
                  options.signer.signEvent({
                    ...draft,
                    pubkey: options.viewer,
                    created_at: nowSeconds(),
                  }),
              });
        return {
          ...blob,
          type: (blob.type ?? file.type) || undefined,
          ...(await metadata),
        };
      } catch (cause) {
        lastError = cause;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new UploadFailedError(servers[0]?.url ?? "", String(lastError));
  },
});

export const UploaderProvider: ParentComponent<{ value: Uploader }> = (
  props,
) => (
  <UploaderContext.Provider value={props.value}>
    {props.children}
  </UploaderContext.Provider>
);

/** 署名できない場所（Storybook の一部など）では undefined。画像を添える操作を出さない。 */
export const useUploader = (): Uploader | undefined =>
  useContext(UploaderContext);
