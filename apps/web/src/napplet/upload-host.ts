import type { NappletHost, UploadResult } from "@streets/core/napplet/session";
import type { Uploader } from "../media/uploader";
import type { UploadPrompt } from "./UploadSheet";

/** 1 つのファイルの上限。Streets の投稿欄と同じく、大きすぎるものは上げさせない。 */
const MAX_BYTES = 100 * 1024 * 1024;
const RAILS = ["blossom", "nip96"] as const;
type Rail = (typeof RAILS)[number];

const isRail = (value: string): value is Rail =>
  (RAILS as readonly string[]).includes(value);

let issued = 0;

/**
 * NAP-UPLOAD。Streets のアップロード先（設定の順）へ上げる。署名（Blossom の認可・
 * NIP-98）は Streets がする。上げてよいかは、許していなければ毎回確かめる。
 */
export const createUploadHost = (options: {
  uploader: () => Uploader | undefined;
  granted: () => boolean;
  grant: () => void;
  ask: (prompt: UploadPrompt) => Promise<{ remember: boolean } | undefined>;
}): NappletHost["upload"] => {
  const results = new Map<string, UploadResult>();
  return {
    info: () => {
      const servers = options.uploader()?.servers() ?? [];
      return {
        rails: RAILS.map((rail) => ({
          rail,
          enabled: servers.some((server) => server.protocol === rail),
          returns: ["https"],
        })),
        maxBytes: MAX_BYTES,
      };
    },
    status: (uploadId) => results.get(uploadId),
    upload: async (request) => {
      const uploader = options.uploader();
      if (!uploader) return { error: "policy denied" };
      if (request.rail !== undefined && !isRail(request.rail)) {
        return { error: "unsupported rail" };
      }
      const rail = request.rail;
      const servers = uploader
        .servers()
        .filter((server) => !rail || server.protocol === rail);
      const first = servers[0];
      if (!first) {
        return { error: rail ? "unsupported rail" : "no server configured" };
      }
      if (request.data.size > MAX_BYTES) return { error: "file too large" };
      const mimeType =
        request.mimeType ?? (request.data.type || "application/octet-stream");
      issued += 1;
      const uploadId = `upload-${issued}`;
      const finish = (result: Omit<UploadResult, "uploadId" | "updatedAt">) => {
        const done = {
          ...result,
          uploadId,
          updatedAt: Math.floor(Date.now() / 1000),
        };
        results.set(uploadId, done);
        return done;
      };
      if (!options.granted()) {
        const previewUrl = mimeType.startsWith("image/")
          ? URL.createObjectURL(request.data)
          : undefined;
        const approved = await options
          .ask({
            ...(request.filename ? { filename: request.filename } : {}),
            mimeType,
            size: request.data.size,
            ...(previewUrl ? { previewUrl } : {}),
            server: new URL(first.url).hostname,
            ...(request.caption ? { caption: request.caption } : {}),
          })
          .finally(() => previewUrl && URL.revokeObjectURL(previewUrl));
        if (!approved) {
          return finish({
            ok: false,
            status: "cancelled",
            rail: rail ?? first.protocol,
            error: "user cancelled",
          });
        }
        if (approved.remember) options.grant();
      }
      try {
        const file = new File([request.data], request.filename ?? "upload", {
          type: mimeType,
        });
        const blob = await uploader.upload(
          file,
          rail ? { protocol: rail } : {},
        );
        const type = blob.type ?? mimeType;
        // > The shell SHOULD populate `nip94` so a napplet can attach the file to a Nostr event
        return finish({
          ok: true,
          status: "complete",
          rail: blob.server.protocol,
          url: blob.url,
          sha256: blob.sha256,
          size: blob.size,
          mimeType: type,
          ...(blob.dimensions ? { dimensions: blob.dimensions } : {}),
          ...(blob.blurhash ? { blurhash: blob.blurhash } : {}),
          nip94: [
            ["url", blob.url],
            ["m", type],
            ["x", blob.sha256],
            ["size", String(blob.size)],
            ...(blob.dimensions
              ? [["dim", `${blob.dimensions.width}x${blob.dimensions.height}`]]
              : []),
            ...(blob.blurhash ? [["blurhash", blob.blurhash]] : []),
            ...(request.caption ? [["alt", request.caption]] : []),
          ],
        });
      } catch {
        return finish({
          ok: false,
          status: "failed",
          rail: rail ?? first.protocol,
          error: "upload failed",
        });
      }
    },
  };
};
