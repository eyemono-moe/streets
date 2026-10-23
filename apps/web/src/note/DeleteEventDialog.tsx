import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";

/**
 * 自分の投稿を消す前に確かめる。リレーは削除の依頼に従うとは限らず、取り消しも
 * できないので、消えきらないことを押す前に伝える。
 */
const DeleteEventDialog: Component<{
  event: NostrEvent;
  onClose: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <DialogRoot open onClose={props.onClose} role="alertdialog">
      <DialogPortal>
        <DialogContent class="w-full max-w-100 rounded-3 border border-primary">
          <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
            <DialogTitle class="min-w-0 flex-1 font-600 text-body">
              {t("note.deleteDialog.title")}
            </DialogTitle>
            <DialogClose />
          </div>
          <DialogBody class="px-4 pb-4">
            <DialogDescription class="text-caption">
              {t("note.deleteDialog.description")}
            </DialogDescription>
          </DialogBody>
          <div class="flex shrink-0 justify-end gap-2 px-4 pb-4">
            <Button variant="ghost" onClick={props.onClose}>
              {t("note.deleteDialog.cancel")}
            </Button>
            <Button
              variant="danger"
              icon="i-material-symbols:delete-outline-rounded"
              onClick={() => {
                dispatch({ type: "note/delete", target: props.event });
                props.onClose();
              }}
            >
              {t("note.deleteDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default DeleteEventDialog;
