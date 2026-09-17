import { createSignal } from "solid-js";
import { notifyError } from "../toast";

/**
 * 押している間は二重に送らない。失敗したらトーストで理由を出す ——
 * 失敗の知らせはボタンの脇ではなく、画面で 1 か所に集める。
 */
export const useSend = (what?: string) => {
  const [sending, setSending] = createSignal(false);
  const run = async (task: () => Promise<void>) => {
    if (sending()) return;
    setSending(true);
    try {
      await task();
    } catch (cause) {
      notifyError(cause, what);
    } finally {
      setSending(false);
    }
  };
  return { sending, run };
};
