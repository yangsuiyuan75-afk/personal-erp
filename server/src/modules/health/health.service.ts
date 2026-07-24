import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<Record<string, unknown>> {
    const checkedAt = new Date().toISOString()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'operational', database: 'connected', checkedAt }
    } catch {
      return { status: 'degraded', database: 'unavailable', checkedAt }
    }
  }
}
