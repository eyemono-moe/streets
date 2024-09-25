import { createSignal } from "solid-js";

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

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

export const durationHuman = (millis: number): string => {
  let remainMillis = millis;
  const days = Math.floor(remainMillis / day);
  remainMillis -= days * day;
  const hours = Math.floor(remainMillis / hour);
  remainMillis -= hours * hour;
  const minutes = Math.floor(remainMillis / minute);
  remainMillis -= minutes * minute;
  const seconds = Math.floor(remainMillis / second);
  remainMillis -= seconds * second;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  if (seconds > 0) return `${seconds}s`;
  // return `${remainMillis} ms`;
  return "now";
};

const [now, setNow] = createSignal(new Date());
setInterval(() => setNow(new Date()), 10000);

export const diffHuman = (target: Date): (() => string) => {
  return () => {
    const diff = now().getTime() - target.getTime();
    const human = durationHuman(Math.abs(diff));
    return human;
  };
};
