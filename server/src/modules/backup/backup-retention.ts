export interface RetentionCandidate {
  id: string;
  completedAt: Date;
  locked: boolean;
}

function calendarDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isoWeek(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function selectExpiredBackupIds(
  candidates: RetentionCandidate[],
  timeZone = 'Asia/Shanghai',
): string[] {
  const sorted = [...candidates].sort(
    (left, right) => right.completedAt.getTime() - left.completedAt.getTime(),
  );
  const keep = new Set(sorted.filter((item) => item.locked).map((item) => item.id));
  const daily = new Set<string>();
  const weekly = new Set<string>();
  const monthly = new Set<string>();

  for (const item of sorted) {
    const day = calendarDate(item.completedAt, timeZone);
    const week = isoWeek(day);
    const month = day.slice(0, 7);
    if (daily.size < 7 && !daily.has(day)) {
      daily.add(day);
      keep.add(item.id);
    }
    if (weekly.size < 4 && !weekly.has(week)) {
      weekly.add(week);
      keep.add(item.id);
    }
    if (monthly.size < 12 && !monthly.has(month)) {
      monthly.add(month);
      keep.add(item.id);
    }
  }

  return sorted.filter((item) => !keep.has(item.id)).map((item) => item.id);
}
