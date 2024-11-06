import { type ServerConfiguration, readServerConfig } from "nostr-tools/nip96";
import {
  type ParentComponent,
  type Resource,
  createContext,
  createResource,
  useContext,
} from "solid-js";
import * as v from "valibot";
import { createLocalStore } from "../shared/libs/createLocalStore";

const fileServerState = v.object({
  version: v.literal(0),
  serverUrl: v.string(),
});

type FileServerState = v.InferOutput<typeof fileServerState>;

const initialState = (): FileServerState => ({
  version: 0,
  serverUrl: "https://nostrcheck.me",
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
      serverConfig: Resource<ServerConfiguration>,
      actions: {
        setServerUrl: (api: string) => void;
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

  const [serverConfig] = createResource(
    () => state.serverUrl,
    (serverUrl) => readServerConfig(serverUrl),
  );

  return (
    <FileServerContext.Provider
      value={[
        state,
        serverConfig,
        {
          setServerUrl: (api) => {
            setState("serverUrl", api);
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
