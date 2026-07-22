import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './database-cleanup';

describe('Phase 8 backup API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let token: string;
  let backupId: string;
  let backupNo: string;

  beforeAll(async () => {
    await cleanDatabase(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/bootstrap')
      .send({ username: 'admin', password: 'StrongPassword!2026' })
      .expect(201);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('creates, lists, verifies, downloads and locks a manual backup', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app.getHttpServer())
      .post('/api/v1/backups')
      .set(auth)
      .send({ locked: false })
      .expect(201);
    expect(created.body.data.status).toBe('VERIFIED');
    backupId = created.body.data.id;
    backupNo = created.body.data.backupNo;

    await request(app.getHttpServer())
      .get(
        '/api/v1/backups?page=1&pageSize=10&backupStatus=VERIFIED&sortBy=completedAt&sortOrder=desc',
      )
      .set(auth)
      .expect(200)
      .expect(({ body }) => expect(body.meta.total).toBe(1));
    await request(app.getHttpServer())
      .post(`/api/v1/backups/${backupId}/verify`)
      .set(auth)
      .expect(201)
      .expect(({ body }) => expect(body.data.sha256).toMatch(/^[0-9a-f]{64}$/));
    await request(app.getHttpServer())
      .get(`/api/v1/backups/${backupId}/download`)
      .set(auth)
      .expect(200)
      .expect('content-type', /postgresql\.custom-backup/)
      .expect(({ body }) =>
        expect(Buffer.from(body).subarray(0, 5).toString('ascii')).toBe('PGDMP'),
      );
    await request(app.getHttpServer())
      .patch(`/api/v1/backups/${backupId}/lock`)
      .set(auth)
      .send({ locked: true })
      .expect(200)
      .expect(({ body }) => expect(body.data.locked).toBe(true));
  }, 60_000);

  it('requires both the current password and exact destructive confirmation phrase', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer())
      .post(`/api/v1/backups/${backupId}/restore`)
      .set(auth)
      .send({ password: 'StrongPassword!2026', confirmPhrase: 'RESTORE WRONG' })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('RESTORE_CONFIRMATION_INVALID'));
    await request(app.getHttpServer())
      .post(`/api/v1/backups/${backupId}/restore`)
      .set(auth)
      .send({ password: 'WrongPassword!2026', confirmPhrase: `RESTORE ${backupNo}` })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe('PASSWORD_INVALID'));
  });

  it('disables the public Bootstrap restore path after an administrator exists', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/bootstrap-recovery/status')
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({
          schemaReady: true,
          initialized: true,
          recoveryRequired: false,
        }),
      );
  });
});
