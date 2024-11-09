import type { OptionalFormDataFields } from "nostr-tools/nip96";
import { getToken } from "nostr-tools/nip98";
import { createSignal } from "solid-js";
import * as v from "valibot";
import { useI18n } from "../../i18n";
import { toast } from "./toast";
import { useNIP07 } from "./useNIP07";

const fileUploadResSchema = v.object({
  status: v.union([
    v.literal("success"),
    v.literal("error"),
    v.literal("processing"),
  ]),
  message: v.string(),
  nip94_event: v.optional(
    v.object({
      tags: v.pipe(
        v.array(v.tuple([v.string(), v.string()])),
        v.check((input) => {
          // need url and ox
          let hasUrl = false;
          let hasOx = false;
          for (const [key] of input) {
            if (key === "url") {
              hasUrl = true;
            } else if (key === "ox") {
              hasOx = true;
            }
          }
          return hasUrl && hasOx;
        }),
      ),
    }),
  ),
});
type FileUploadRes = v.InferOutput<typeof fileUploadResSchema>;

export type UploadFileProps = {
  apiUrl: string;
  file: File;
  mediaType?: OptionalFormDataFields["media_type"];
};

// https://github.com/nostr-protocol/nips/blob/master/96.md

const getAuthHeader = (loginUrl: string): Promise<string> => {
  const nip07 = useNIP07();
  const sign = nip07.signEvent.bind(nip07);
  return getToken(loginUrl, "POST", sign, true);
};

type HttpErrorType =
  | "fileTooLarge"
  | "badRequest"
  | "forbidden"
  | "paymentRequired"
  | "unknown";

export const uploadFile = async (
  props: UploadFileProps,
): Promise<FileUploadRes | { status: "httpError"; type: HttpErrorType }> => {
  const { file, apiUrl, mediaType } = props;

  const authHeader = await getAuthHeader(apiUrl);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("size", file.size.toString(10));
  console.log("filetype", file.type);
  formData.append("content_type", file.type);
  if (mediaType) formData.append("media_type", mediaType);
  // TODO: alt/caption

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  const resJson = await res.json();
  if (!res.ok) {
    switch (res.status) {
      case 413: {
        // File size exceeds limit
        return { status: "httpError", type: "fileTooLarge" };
      }
      case 400: {
        // Form data is invalid or not supported
        return { status: "httpError", type: "badRequest" };
      }
      case 403: {
        // User is not allowed to upload or the uploaded file hash didn't match the hash included in the Authorization header payload tag.
        return { status: "httpError", type: "forbidden" };
      }
      case 402: {
        // Payment is required by the server, this flow is undefined.
        return { status: "httpError", type: "paymentRequired" };
      }
      default: {
        return { status: "httpError", type: "unknown" };
      }
    }
  }

  const parsed = v.safeParse(fileUploadResSchema, resJson);
  if (parsed.success) {
    return parsed.output;
  }
  throw new Error(`Invalid response: ${JSON.stringify(parsed.issues)}`);
};
export type FileUploadResponse = Awaited<ReturnType<typeof uploadFile>>;

const t = useI18n();
const httpErrorMessage = (type: HttpErrorType) => {
  return t(`fileUpload.httpError.${type}`) ?? "";
};

export const handleErrorResponse = (res: FileUploadResponse) => {
  if (res.status === "httpError") {
    toast.error(t("fileUpload.failed", { error: httpErrorMessage(res.type) }));
    throw new Error(`HTTP error: ${res.type}`);
  }
  if (res.status === "error") {
    toast.error(t("fileUpload.failed", { error: res.message }));
    throw new Error(`Upload failed: ${res.message}`);
  }
  return res;
};

export const useUploadFiles = () => {
  const [progress, setProgress] = createSignal(0);
  const [isUploading, setIsUploading] = createSignal(false);

  const uploadFiles = async (files: File[], apiUrl: string) => {
    setProgress(0);
    setIsUploading(true);

    const ps = files.map(async (file) => {
      const res = await uploadFile({ file, apiUrl });
      const handled = handleErrorResponse(res);
      setProgress((prev) => prev + 100 / files.length);
      return handled;
    });

    return Promise.all(ps).finally(() => {
      setIsUploading(false);
      setProgress(0);
    });
  };

  return { uploadFiles, progress, isUploading } as const;
};

export const fileUploadResToImetaTag = (res: FileUploadRes) => {
  const tags = res.nip94_event?.tags;
  if (!tags || tags.length === 0) {
    return;
  }
  return [
    "imeta",
    ...tags
      .filter(([, value]) => value !== "")
      .map(([key, value]) => `${key} ${value}`),
  ];
};

export const extractFileUrl = (res: FileUploadRes) => {
  return res.nip94_event?.tags.find(([key]) => key === "url")?.[1];
};
