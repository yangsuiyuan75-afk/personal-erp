import { PrismaClient } from '@prisma/client'

describe('PostgreSQL integration', () => {
  const prisma = new PrismaClient()

  afterAll(async () => prisma.$disconnect())

  it('connects to the test database', async () => {
    await expect(prisma.$queryRaw`SELECT 1 AS value`).resolves.toEqual([{ value: 1 }])
  })
})
