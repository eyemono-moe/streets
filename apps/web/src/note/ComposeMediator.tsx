import type { BlobDescriptor } from "@streets/core/media/blossom";
import {
  type ComposeEvent,
  type ComposeState,
  canSend,
  composeMedia,
  composeTransition,
  emptyCompose,
  pendingAttachments,
  sendableText,
} from "@streets/core/view/compose";
import type { Component, JSX } from "solid-js";
import { onCleanup } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { useUploader } from "../media/uploader";
import { notifyError } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";
import { uploadErrorMessage } from "../write-errors";

/**
 * 投稿・返信の書きかけを持ち、送る段。何を送るか（投稿か返信か）と、送れたあと
 * どうするか（パネルを閉じる・ダイアログを閉じる）は置き場所ごとに違うので受け取る。
 *
 * 添えたファイルは、送るまで手元に置く。切り抜いてから預けられるし、書くのを
 * やめたときに、出さなかった画像が預け先に残らない。
 */
export const ComposeMediator: Component<{
  send: (text: string, media: readonly BlobDescriptor[]) => Promise<void>;
  /** 失敗したときのトーストの見出し。 */
  failure: string;
  onSent: () => void;
  /** 閉じる操作。送っている途中は閉じない。 */
  onClose?: () => void;
  children: (state: ComposeState) => JSX.Element;
}> = (props) => {
  const [state, setState] = createStore<ComposeState>(emptyCompose());
  const apply = (event: ComposeEvent) =>
    setState(reconcile(composeTransition(unwrap(state), event)));
  const uploader = useUploader();

  // 中身は core に持たせない（純粋な遷移に File は要らない）。見本の URL も
  // ここで作り、外したときに捨てる。
  const files = new Map<string, File>();
  const previews = new Map<string, string>();
  const forget = (id: string) => {
    const preview = previews.get(id);
    if (preview) URL.revokeObjectURL(preview);
    previews.delete(id);
    files.delete(id);
  };
  const keep = (id: string, file: File) => {
    const preview = URL.createObjectURL(file);
    const old = previews.get(id);
    if (old) URL.revokeObjectURL(old);
    files.set(id, file);
    previews.set(id, preview);
    return preview;
  };
  onCleanup(() => {
    for (const preview of previews.values()) URL.revokeObjectURL(preview);
  });

  const attach = (chosen: readonly File[]) => {
    for (const file of chosen) {
      const id = crypto.randomUUID();
      apply({
        type: "compose/attach-add",
        id,
        name: file.name,
        preview: keep(id, file),
        mime: file.type || undefined,
      });
    }
  };

  /** 送る直前に、まだ預けていないものを順に預ける。1 つでも駄目なら送らない。 */
  const uploadPending = async () => {
    for (const attachment of pendingAttachments(unwrap(state))) {
      const file = files.get(attachment.id);
      if (!file) continue;
      apply({ type: "compose/attach-uploading", id: attachment.id });
      try {
        const blob = await uploader?.upload(file);
        if (!blob) throw new Error("画像の預け先が設定されていません");
        apply({ type: "compose/attach-done", id: attachment.id, blob });
      } catch (cause) {
        apply({
          type: "compose/attach-failed",
          id: attachment.id,
          error: uploadErrorMessage(cause),
        });
        throw cause;
      }
    }
  };

  const submit = async () => {
    await uploadPending();
    const current = unwrap(state);
    await props.send(sendableText(current), composeMedia(current));
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "compose/input":
        apply(event);
        return true;
      case "compose/submit": {
        if (!canSend(unwrap(state))) return true;
        apply(event);
        submit().then(
          () => {
            for (const id of [...previews.keys()]) forget(id);
            apply({ type: "compose/sent" });
            props.onSent();
          },
          (cause) => {
            // 本文も添えたものも残し、そのまま送り直せるようにする。
            apply({ type: "compose/failed" });
            notifyError(cause, props.failure);
          },
        );
        return true;
      }
      case "compose/attach":
        attach(event.files);
        return true;
      case "compose/attach-remove":
        forget(event.id);
        apply(event);
        return true;
      case "compose/attach-move":
        apply(event);
        return true;
      case "compose/attach-crop": {
        const before = files.get(event.id);
        if (!before) return true;
        const cropped = new File([event.image], before.name, {
          type: event.image.type || before.type,
        });
        apply({
          type: "compose/attach-cropped",
          id: event.id,
          preview: keep(event.id, cropped),
          mime: cropped.type || undefined,
        });
        return true;
      }
      case "compose/close":
        if (!state.sending) props.onClose?.();
        return true;
      default:
        return false;
    }
  };

  return <Mediates handle={handle}>{props.children(state)}</Mediates>;
};
