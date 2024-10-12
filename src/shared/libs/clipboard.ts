import { toast } from "./toast";

export const copyToClipboard = (text: string) => {
  if (!navigator.clipboard || !navigator.clipboard.writeText)
    throw new Error("can not use navigator.clipboard.writeText");

  toast.promise(navigator.clipboard.writeText(text), {
    loading: "copying...",
    success: () => "copied!",
    error: () => "failed to copy",
  });
};
