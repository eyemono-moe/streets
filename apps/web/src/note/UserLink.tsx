import { buildUserColumn } from "@streets/core/deck/column-presets";
import type { Component } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import Name from "./Name";

/**
 * 文の中に出てくる人の名前。アイコンと同じく、触れると名刺、押すとその人のカラムを重ねる。
 * 見た目（太さ・色・切り方）は置き場所ごとに違うので受け取る。
 */
const UserLink: Component<{ pubkey: string; class?: string }> = (props) => {
  const dispatch = useDispatch();
  return (
    <UserCardHover
      pubkey={props.pubkey}
      trigger={(triggerProps) => (
        <button
          {...triggerProps({
            type: "button",
            class: `bg-transparent p-0 text-left enabled:cursor-pointer hover:underline ${props.class ?? ""}`,
            onClick: () =>
              dispatch({
                type: "stack/open",
                column: buildUserColumn(props.pubkey),
              }),
          })}
        >
          <Name pubkey={props.pubkey} />
        </button>
      )}
    />
  );
};

export default UserLink;
