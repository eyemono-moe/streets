import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";

/**
 * URL の 1 区画を一時カラムとして読めなかったときに、一時カラムの場所へ出す。
 * 古い版のパス（`/post` など）を開き続けている人もいるので、閉じて `/` へ戻れるようにする。
 */
const UnreadableLink = (props: { entity: string }) => {
  const dispatch = useDispatch();
  return (
    <div class="flex items-start gap-2 p-4">
      <p role="alert" class="c-secondary min-w-0 flex-1 break-all text-caption">
        このリンクは読めませんでした：{props.entity}
      </p>
      <IconButton
        icon="i-material-symbols:close-rounded"
        label="閉じる"
        size="sm"
        onClick={() => dispatch({ type: "deck/close-temp" })}
      />
    </div>
  );
};

export default UnreadableLink;
