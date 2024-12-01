import { useColumn } from "../context/column";
import { useDeck } from "../context/deck";
import type { ColumnStateWithoutID } from "./deckSchema";

export const useOpenUserColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnStateWithoutID = {
      content: {
        type: "user",
        pubkey,
      },
      size: "medium",
    };

    if (columnActions) {
      columnActions.openTempColumn(newCol.content);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenFolloweesColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnStateWithoutID = {
      content: {
        type: "followees",
        pubkey,
      },
      size: "medium",
    };

    if (columnActions) {
      columnActions.openTempColumn(newCol.content);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenFollowersColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnStateWithoutID = {
      content: {
        type: "followers",
        pubkey,
      },
      size: "medium",
    };

    if (columnActions) {
      columnActions.openTempColumn(newCol.content);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenReactionsColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (pubkey: string, index?: number) => {
    const newCol: ColumnStateWithoutID = {
      content: {
        type: "reactions",
        pubkey,
      },
      size: "medium",
    };

    if (columnActions) {
      columnActions.openTempColumn(newCol.content);
      return;
    }

    addColumn(newCol, index);
  };
};

export const useOpenRepostsColumn = () => {
  const columnActions = useColumn()?.[1];
  const [, { addColumn }] = useDeck();

  return (targetEventID: string, index?: number) => {
    const newCol: ColumnStateWithoutID = {
      content: {
        type: "reposts",
        targetEventID,
      },
      size: "medium",
    };

    if (columnActions) {
      columnActions.openTempColumn(newCol.content);
      return;
    }

    addColumn(newCol, index);
  };
};
