import { describe, expect, it } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('omits the time portion from ISO timestamps', () => {
    expect(formatDate('2026-07-21T00:00:00.000Z')).toBe('2026年7月21日');
  });
});
