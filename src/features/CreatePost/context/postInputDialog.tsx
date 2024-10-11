import {
  type ParentComponent,
  createContext,
  createMemo,
  createSignal,
  lazy,
  useContext,
} from "solid-js";
import { useDialog } from "../../../shared/libs/useDialog";
const PostInput = lazy(() => import("../components/PostInput"));

type OpenPostInputProps = {
  text?: string;
  reply?: {
    rootId: string;
    replyId?: string;
  };
  mention?: string[];
};

const PostInputContext = createContext<(props: OpenPostInputProps) => void>();

export const PostInputProvider: ParentComponent = (props) => {
  const { Dialog: PostInputDialog, open } = useDialog();

  const [state, setState] = createSignal<OpenPostInputProps>();

  const tags = createMemo(() => {
    const _state = state();
    const _tags: string[][] = [];

    if (_state?.reply) {
      _tags.push(["e", _state.reply.rootId, "", "root"]);

      if (_state.reply.replyId) {
        _tags.push(["e", _state.reply.replyId, "", "reply"]);
      }
    }

    if (_state?.mention) {
      _tags.push(..._state.mention.map((pubkey) => ["p", pubkey]));
    }

    return _tags;
  });

  const openPostInput = (props: OpenPostInputProps) => {
    setState(props);
    open();
  };

  return (
    <PostInputContext.Provider value={openPostInput}>
      {props.children}
      <PostInputDialog>
        <PostInput defaultContent={state()?.text} tags={tags()} />
      </PostInputDialog>
    </PostInputContext.Provider>
  );
};

export const usePostInput = () => {
  const ctx = useContext(PostInputContext);

  if (!ctx) {
    throw new Error("usePostInput must be used within a PostInputProvider");
  }

  return ctx;
};
