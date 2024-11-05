import {
  type FileUploadResponse,
  type OptionalFormDataFields,
  uploadFile as nip96UploadFile,
} from "nostr-tools/nip96";
import { getToken } from "nostr-tools/nip98";
import { useFileServer } from "../../context/fileServer";
import { useNIP07 } from "./useNIP07";

type UploadFileProps = {
  file: File;
  mediaType?: OptionalFormDataFields["media_type"];
};

// https://github.com/nostr-protocol/nips/blob/master/96.md

const getAuthHeader = (loginUrl: string): Promise<string> => {
  const sign = useNIP07().signEvent;
  return getToken(loginUrl, "POST", sign, true);
};

export const uploadFile = async (props: UploadFileProps) => {
  const [fileServer] = useFileServer();
  const apiUrl = fileServer.selectedApiURL;
  const { file } = props;

  const authHeader = await getAuthHeader(apiUrl);

  const res = await nip96UploadFile(file, apiUrl, authHeader, {
    size: file.size.toString(10),
    media_type: props.mediaType,
    content_type: file.type,
    // TODO: alt/caption
  });
  return res;
};

export const fileUploadResToImetaTag = (res: FileUploadResponse) => {
  const tags = res.nip94_event?.tags;
  if (!tags || tags.length === 0) {
    return;
  }
  return ["imeta", ...tags.map(([key, value]) => `${key} ${value}`)];
};
