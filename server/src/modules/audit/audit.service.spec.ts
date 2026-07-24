import { sanitizeAuditValue } from './audit.service'

describe('audit sanitization', () => {
  it('redacts nested credentials', () => {
    expect(
      sanitizeAuditValue({ username: 'admin', password: 'secret', nested: { accessToken: 'raw' } }),
    ).toEqual({ username: 'admin', password: '[REDACTED]', nested: { accessToken: '[REDACTED]' } })
  })
})
