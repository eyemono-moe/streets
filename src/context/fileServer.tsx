import { type ParentComponent, createContext, useContext } from "solid-js";
import * as v from "valibot";
import { createLocalStore } from "../shared/libs/createLocalStore";

const fileServerState = v.object({
  version: v.literal(0),
  selectedApiURL: v.string(),
});

type FileServerState = v.InferOutput<typeof fileServerState>;

const initialState = (): FileServerState => ({
  version: 0,
  selectedApiURL: "https://nostrcheck.me",
});

export const defaultFileServers: string[] = [
  "https://nostrcheck.me",
  "https://nostr.build",
  "https://nostrage.com",
  "https://files.sovbit.host",
  "https://void.cat",
  "https://nostpic.com",
  "https://mockingyou.com/",
  "https://nostr.onch.services/",
];

const FileServerContext =
  createContext<
    [
      state: FileServerState,
      actions: {
        setDefaultApi: (api: string) => void;
        reset: () => void;
      },
    ]
  >();

export const FileServerProvider: ParentComponent = (props) => {
  // TODO: アプリ固有データとして保存する (https://github.com/nostr-protocol/nips/blob/master/78.md)
  const [state, setState] = createLocalStore(
    "monostr.fileServer",
    initialState(),
    (str) => {
      const res = v.safeParse(fileServerState, JSON.parse(str));
      if (res.success) {
        return res.output;
      }
      console.error(res.issues);
      return initialState();
    },
  );

  return (
    <FileServerContext.Provider
      value={[
        state,
        {
          setDefaultApi: (api) => {
            setState("selectedApiURL", api);
          },
          reset: () => {
            setState(initialState());
          },
        },
      ]}
    >
      {props.children}
    </FileServerContext.Provider>
  );
};

export const useFileServer = () => {
  const ctx = useContext(FileServerContext);

  if (!ctx) {
    throw new Error(
      "[context provider not found] FileServerProvider is not found",
    );
  }
  return ctx;
};
