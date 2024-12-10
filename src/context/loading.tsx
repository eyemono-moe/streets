import { type ParentComponent, createContext, useContext } from "solid-js";
import { createStore } from "solid-js/store";

export type SendingState = {
  id: number;
  /** すべての送信先リレーについて送信中かどうか */
  sending: boolean;
  /** どれか1つでも成功したかどうか, 送信中でない場合は最後の送信の結果 */
  successAny: boolean | undefined;
  error: unknown;
  relayStates: {
    [relay: string]:
      | {
          done: boolean;
          notice?: string;
        }
      | undefined;
  };
};

const defaultState: SendingState = {
  id: -1,
  sending: false,
  successAny: undefined,
  relayStates: {},
  error: undefined,
};

const LoadingContext = createContext<
  [
    latestSendState: SendingState,
    actions: {
      setLatestSendState: (state: SendingState) => void;
    },
  ]
>([
  defaultState,
  {
    setLatestSendState: () => {},
  },
]);

export const LoadingProvider: ParentComponent = (props) => {
  const [state, setState] = createStore(defaultState);

  return (
    <LoadingContext.Provider value={[state, { setLatestSendState: setState }]}>
      {props.children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => useContext(LoadingContext);
