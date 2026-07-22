import { selectExpiredBackupIds } from './backup-retention';

describe('backup retention', () => {
  it('keeps daily, weekly, monthly and locked restore points', () => {
    const records = Array.from({ length: 18 }, (_, index) => ({
      id: `backup-${index}`,
      completedAt: new Date(Date.UTC(2026, 6 - index, 15, 4)),
      locked: index === 17,
    }));
    const expired = selectExpiredBackupIds(records);
    expect(expired).toContain('backup-12');
    expect(expired).not.toContain('backup-0');
    expect(expired).not.toContain('backup-17');
  });

  it('retains only the newest backup for duplicate period buckets', () => {
    const records = Array.from({ length: 10 }, (_, index) => ({
      id: `same-day-${index}`,
      completedAt: new Date(Date.UTC(2026, 6, 16, 12, 0, 10 - index)),
      locked: false,
    }));
    expect(selectExpiredBackupIds(records)).toEqual(records.slice(1).map((item) => item.id));
  });
});
