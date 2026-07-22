import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta } from '../../common/dto/list-query.dto';
import { PrismaService } from '../../database/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';

const SENSITIVE_KEYS = /password|token|authorization|cookie|secret/i;

function sanitize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item) ?? null);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.test(key) ? '[REDACTED]' : (sanitize(item) ?? null),
      ]),
    );
  }
  return String(value);
}

function auditJson(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined {
  const sanitized = sanitize(value);
  if (sanitized === undefined) return undefined;
  if (sanitized === null) return Prisma.JsonNull;
  return sanitized as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    userId?: string;
    module: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    result?: string;
    requestId?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        ...input,
        before: auditJson(input.before),
        after: auditJson(input.after),
        result: input.result ?? 'SUCCESS',
      },
    });
  }

  async list(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...(query.keyword
        ? {
            OR: [
              { entityId: { contains: query.keyword, mode: 'insensitive' } },
              { requestId: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({ ...row, id: row.id.toString() })),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }
}

export { sanitize as sanitizeAuditValue };
