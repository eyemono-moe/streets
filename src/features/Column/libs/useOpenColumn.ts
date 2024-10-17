import { useColumn } from "../context/column";
import { useDeck } from "../context/deck";
import type { ColumnState } from "./deckSchema";

export const useOpenUserColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnState = {
      type: "user",
      pubkey,
      size: "medium",
    };

    if (columnActions) {
      columnActions.addColumnAfterThis(newCol);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenFolloweesColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnState = {
      type: "followees",
      pubkey,
      size: "medium",
    };

    if (columnActions) {
      columnActions.addColumnAfterThis(newCol);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenFollowersColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnState = {
      type: "followers",
      pubkey,
      size: "medium",
    };

    if (columnActions) {
      columnActions.addColumnAfterThis(newCol);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenReactionsColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnState = {
      type: "reactions",
      pubkey,
      size: "medium",
    };

    if (columnActions) {
      columnActions.addColumnAfterThis(newCol);
      return;
    }

    addColumn(newCol, index);
  };
};
