import { leading, throttle } from "@solid-primitives/scheduled";
import { createMemo, createSignal } from "solid-js";
import { getTextOrFile } from "../../../shared/libs/dataTransfer";
import { contains } from "../../../shared/libs/dom";

export const useFileDrop = (onDrop: (textOrFiles: string | File[]) => void) => {
  const [isDragging, setIsDragging] = createSignal(false);
  const [isDragStartInside, setIsDragStartInside] = createSignal(false);
  const canDrop = createMemo(() => isDragging() && !isDragStartInside());

  const _onDrop = (e: DragEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // // debug
    // console.table(
    //   e.dataTransfer?.types.map((type) => [
    //     type,
    //     e.dataTransfer?.getData(type),
    //   ]),
    // );

    const droppable = canDrop();

    setIsDragging(false);
    setIsDragStartInside(false);

    if (droppable && e.dataTransfer) {
      const res = getTextOrFile(e.dataTransfer);
      if (res) {
        onDrop(res);
      }
    }
  };

  const onDragStart = (e: DragEvent) => {
    e.stopPropagation();
    setIsDragStartInside(true);
  };

  const hasFilesOrItems = (dataTransfer: DataTransfer) =>
    dataTransfer.files.length > 0 || dataTransfer.items?.length > 0;

  const onDragOver = leading(
    throttle,
    (e: DragEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      } catch {}

      if (e.dataTransfer && hasFilesOrItems(e.dataTransfer)) {
        setIsDragging(true);
      }
    },
    50,
  );

  const onDragLeave = (e: DragEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (contains(e.currentTarget, e.relatedTarget)) return;

    setIsDragging(false);
  };

  return {
    isDragging,
    canDrop,
    onDrop: _onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
  };
};
