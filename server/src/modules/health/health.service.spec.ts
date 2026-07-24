import { HealthService } from './health.service'

describe('HealthService', () => {
  it('returns operational when PostgreSQL responds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) }
    const service = new HealthService(prisma as never)
    await expect(service.check()).resolves.toMatchObject({
      status: 'operational',
      database: 'connected',
    })
  })

  it('returns degraded instead of crashing when PostgreSQL is unavailable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('offline')) }
    const service = new HealthService(prisma as never)
    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      database: 'unavailable',
    })
  })
})
