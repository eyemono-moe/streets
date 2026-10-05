import { type Component, createEffect, onCleanup } from "solid-js";
import { toaster } from "./toast";

/** 知らせの文言。ストーリーでも同じものを並べる。 */
export const disconnectedToast = (message?: string) => ({
  type: "error" as const,
  title: "署名器と繋がっていません",
  description: `読むことはできますが、投稿やリアクションはできません。${message ?? ""}`,
});

/**
 * 保存したログインを戻せなかった間、閉じるまで残る知らせを出す。画面は読み取りだけで
 * 出したままにし、繋ぎ直す道をここに置く。閉じられたら、繋がるか次に失敗するまで出し直さない。
 */
const SignerDisconnectedNotice: Component<{
  disconnected: boolean;
  message?: string;
  onRetry: () => void;
}> = (props) => {
  let id: string | undefined;

  const remove = () => {
    if (!id) return;
    const current = id;
    id = undefined;
    toaster.remove(current);
  };

  createEffect(() => {
    if (!props.disconnected) {
      remove();
      return;
    }
    const toast = disconnectedToast(props.message);
    if (id) {
      toaster.update(id, { description: toast.description });
      return;
    }
    const created = toaster.create({
      ...toast,
      duration: Number.POSITIVE_INFINITY,
      action: { label: "繋ぎ直す", onClick: () => props.onRetry() },
      onStatusChange: (details) => {
        if (details.status === "unmounted" && id === created) id = undefined;
      },
    });
    id = created;
  });

  onCleanup(remove);
  return null;
};

export default SignerDisconnectedNotice;
