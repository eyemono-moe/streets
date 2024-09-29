import { useColumn } from "../context/column";
import { useDeck } from "../context/deck";

export const useOpenUserColumn = () => {
  // TODO: もしすでにカラムが存在している場合はそのカラムにスクロールする

  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    if (columnActions) {
      columnActions.addColumnAfterThis({
        type: "user",
        pubkey,
        size: "medium",
      });
      return;
    }

    addColumn(
      {
        type: "user",
        pubkey,
        size: "medium",
      },
      index,
    );
  };
};
