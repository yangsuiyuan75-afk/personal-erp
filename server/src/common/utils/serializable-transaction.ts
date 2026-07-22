import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

export async function serializableTransaction<T>(
  prisma: PrismaService,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt === attempts) throw error;
    }
  }
  throw new Error('Serializable transaction retry exhausted');
}
