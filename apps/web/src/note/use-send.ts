import { createSignal } from "solid-js";
import { actionErrorMessage } from "../actions";

/** 押している間は二重に送らない。失敗したら理由を出し、もう一度押せるようにする。 */
export const useSend = () => {
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const run = async (task: () => Promise<void>) => {
    if (sending()) return;
    setSending(true);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setSending(false);
    }
  };
  return { sending, error, run };
};
