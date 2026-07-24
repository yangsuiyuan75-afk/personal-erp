import { createHash, randomBytes } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import argon2 from 'argon2'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../../database/prisma.service'
import type { AuthUser } from './auth.types'
import type { ChangePasswordDto, CredentialsDto } from './dto/auth.dto'

const REFRESH_DAYS = 30

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async status() {
    const rows = await this.prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public."AdminUser"')::text AS table_name
    `
    if (!rows[0]?.table_name) {
      return { initialized: false, recoveryRequired: true }
    }
    return {
      initialized: (await this.prisma.adminUser.count()) > 0,
      recoveryRequired: false,
    }
  }

  async bootstrap(dto: CredentialsDto, requestId?: string) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id })
    let user
    try {
      user = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(70657270)`
          if ((await tx.adminUser.count()) > 0) {
            throw new ConflictException({ code: 'ADMIN_EXISTS', message: '管理员已创建' })
          }
          return tx.adminUser.create({ data: { username: dto.username.trim(), passwordHash } })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      if (error instanceof ConflictException) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'USERNAME_EXISTS', message: '用户名已存在' })
      }
      throw error
    }

    await this.audit.record({
      userId: user.id,
      module: 'AUTH',
      action: 'BOOTSTRAP_ADMIN',
      entityType: 'AdminUser',
      entityId: user.id,
      after: { username: user.username },
      requestId,
    })
    return this.createSession({ id: user.id, username: user.username })
  }

  async login(dto: CredentialsDto, requestId?: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { username: dto.username.trim() },
    })
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID', message: '用户名或密码错误' })
    }
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    await this.audit.record({
      userId: user.id,
      module: 'AUTH',
      action: 'LOGIN',
      entityType: 'AdminUser',
      entityId: user.id,
      requestId,
    })
    return this.createSession({ id: user.id, username: user.username })
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'REFRESH_REQUIRED', message: '请重新登录' })
    }
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: tokenHash(refreshToken) },
      include: { user: true },
    })
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: '登录状态已失效' })
    }
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    })
    return this.createSession({ id: session.user.id, username: session.user.username })
  }

  async logout(refreshToken?: string, userId?: string, requestId?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: tokenHash(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    await this.audit.record({
      userId,
      module: 'AUTH',
      action: 'LOGOUT',
      entityType: 'AdminUser',
      entityId: userId,
      requestId,
    })
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException({ code: 'AUTH_INVALID', message: '管理员不存在' })
    return { id: user.id, username: user.username }
  }

  async verifyPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId } })
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException({ code: 'PASSWORD_INVALID', message: '当前管理员密码错误' })
    }
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, requestId?: string): Promise<void> {
    if (dto.currentPassword === dto.newPassword) {
      throw new UnprocessableEntityException({
        code: 'PASSWORD_UNCHANGED',
        message: '新密码不能与当前密码相同',
      })
    }
    const stored = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } })
    if (!(await argon2.verify(stored.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException({ code: 'PASSWORD_INVALID', message: '当前密码错误' })
    }
    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id })
    await this.prisma.$transaction([
      this.prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])
    await this.audit.record({
      userId: user.id,
      module: 'AUTH',
      action: 'CHANGE_PASSWORD',
      entityType: 'AdminUser',
      entityId: user.id,
      requestId,
    })
  }

  private async createSession(user: AuthUser) {
    const refreshToken = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000)
    await this.prisma.refreshSession.create({
      data: { userId: user.id, tokenHash: tokenHash(refreshToken), expiresAt },
    })
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, type: 'access' },
      { expiresIn: '15m' },
    )
    return { user, accessToken, refreshToken, refreshExpiresAt: expiresAt }
  }
}

export { tokenHash }
