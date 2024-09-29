import { hex2bech32 } from "./bech32";

export const dateHuman = (date: Date): string => {
  // yyyy/MM/dd HH:mm
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const dateTimeHuman = (date: Date): string => {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = date.getMonth() === now.getMonth();
  const sameDay = date.getDate() === now.getDate();
  if (sameYear && sameMonth && sameDay) {
    // 同日: HH:mm
    return date.toLocaleString("ja-JP", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (sameYear) {
    // 同年: MM/dd HH:mm
    return date.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  // yyyy/MM/dd HH:mm
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const readablePubkey = (pubkey: string) => {
  return hex2bech32(pubkey).slice(0, 14);
};
