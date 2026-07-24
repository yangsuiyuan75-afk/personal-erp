import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { RequestWithId } from '../../common/middleware/request-id.middleware'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../auth/auth.types'
import { OneDriveGraphError, OneDriveService } from './onedrive/onedrive.service'

@ApiTags('OneDrive')
@ApiBearerAuth()
@Controller('onedrive')
export class OneDriveController {
  constructor(
    private readonly oneDrive: OneDriveService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  status(): Promise<unknown> {
    return this.oneDrive.status(true)
  }

  @Post('connect/start')
  async start(@CurrentUser() actor: AuthUser, @Req() request: RequestWithId): Promise<unknown> {
    try {
      const result = await this.oneDrive.startConnection()
      await this.audit.record({
        userId: actor.id,
        module: 'ONEDRIVE',
        action: 'START_DEVICE_CODE',
        entityType: 'OneDriveConnection',
        after: { expiresAt: result.expiresAt, verificationUri: result.verificationUri },
        requestId: request.requestId,
      })
      return result
    } catch (error) {
      if (error instanceof OneDriveGraphError && error.status === 422) {
        throw new UnprocessableEntityException({
          code: 'MICROSOFT_CLIENT_ID_MISSING',
          message: '请先配置 MICROSOFT_CLIENT_ID',
        })
      }
      throw new ServiceUnavailableException({
        code: 'ONEDRIVE_AUTH_START_FAILED',
        message: error instanceof Error ? error.message : '无法启动 OneDrive 授权',
      })
    }
  }

  @Delete('connection')
  @HttpCode(204)
  async disconnect(@CurrentUser() actor: AuthUser, @Req() request: RequestWithId): Promise<void> {
    await this.oneDrive.disconnect()
    await this.audit.record({
      userId: actor.id,
      module: 'ONEDRIVE',
      action: 'DISCONNECT',
      entityType: 'OneDriveConnection',
      requestId: request.requestId,
    })
  }
}
