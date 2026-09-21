import {
  type BlobDescriptor,
  type BlossomServer,
  UploadFailedError,
  buildUploadAuth,
  hashBytes,
  uploadBlob,
} from "@streets/core/media/blossom";
import type { Signer } from "@streets/core/signer/signer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";

export class NoUploadServerError extends Error {
  constructor() {
    super("画像のアップロード先が設定されていません");
    this.name = "NoUploadServerError";
  }
}

export type Uploader = {
  /** アップロード先。1 つも無ければ、画像を添える操作を出さない。 */
  servers: Accessor<readonly BlossomServer[]>;
  upload: (file: File) => Promise<BlobDescriptor>;
};

const UploaderContext = createContext<Uploader>();

/**
 * 画像などを Blossom のサーバーへアップロードする。設定の並び順に試し、最初に受け取って
 * くれたところの URL を使う（1 つのサーバーが落ちていてもアップロードできる）。
 */
export const createUploader = (options: {
  signer: Signer;
  viewer: string;
  servers: Accessor<readonly BlossomServer[]>;
  now?: () => number;
}): Uploader => ({
  servers: options.servers,
  upload: async (file) => {
    const servers = options.servers();
    if (servers.length === 0) throw new NoUploadServerError();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
    // 認可はファイルの中身に結び付く（BUD-01）ので、1 回署名すればどのアップロード先にも使える。
    const auth = await options.signer.signEvent({
      ...buildUploadAuth({
        sha256: hashBytes(bytes),
        name: file.name,
        nowSeconds,
      }),
      pubkey: options.viewer,
      created_at: nowSeconds,
    });

    let lastError: unknown;
    for (const server of servers) {
      try {
        return await uploadBlob({
          server,
          bytes,
          type: file.type || undefined,
          auth,
        });
      } catch (cause) {
        lastError = cause;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new UploadFailedError(servers[0] ?? "", String(lastError));
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
