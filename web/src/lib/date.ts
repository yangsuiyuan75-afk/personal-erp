export function formatDate(value: unknown): string {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(parsed);
}
