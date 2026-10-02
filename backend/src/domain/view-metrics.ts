export function readInstagramViews(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const metric = data.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item as { name?: unknown }).name === 'views',
  );
  if (!metric || typeof metric !== 'object') return null;

  const record = metric as {
    total_value?: { value?: unknown };
    values?: Array<{ value?: unknown }>;
  };
  return asViewCount(record.total_value?.value ?? record.values?.[0]?.value);
}

export function readTikTokViewCount(value: unknown): number | null {
  return asViewCount(value);
}

function asViewCount(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

export function daysWithoutPosting(
  lastPublishedAt: Date | null,
  now: Date,
): number | null {
  if (!lastPublishedAt) return null;
  const elapsed = now.getTime() - lastPublishedAt.getTime();
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}
