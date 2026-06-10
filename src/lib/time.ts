const UNITS: [name: string, seconds: number][] = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60],
];

export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  for (const [name, seconds] of UNITS) {
    if (diff >= seconds) return `${Math.floor(diff / seconds)}${name}`;
  }
  return 'now';
}
