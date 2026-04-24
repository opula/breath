import {toNumber} from 'lodash';

export const convertSecondsToHHMM = (secs: number) => {
  const converted = new Date(secs * 1000).toISOString().slice(14, 21);
  const minutes = toNumber(converted.slice(0, 2));
  const seconds = toNumber(converted.slice(3, converted.length + 1));

  return {minutes, seconds};
};

const MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

// Narrow relative time: "just now" / "3m ago" / "5h ago" / "2d ago",
// falling back to "mar 21" for timestamps older than a week.
export const formatRelativeTime = (timestampMs: number, now = Date.now()) => {
  const mins = Math.floor((now - timestampMs) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(timestampMs);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
};
