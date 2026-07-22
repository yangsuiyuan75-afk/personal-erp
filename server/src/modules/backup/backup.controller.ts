import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import { BackupService } from './backup.service';
import {
  BackupListQueryDto,
  BootstrapRestoreDto,
  CreateBackupDto,
  LockBackupDto,
  RestoreBackupDto,
} from './dto/backup.dto';
import { AllowDuringMaintenance } from './maintenance.guard';

@ApiTags('Backups')
@ApiBearerAuth()
@AllowDuringMaintenance()
@Controller('backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  @ApiOperation({ summary: '查看备份建议、启动补偿与维护模式状态' })
  status() {
    return this.backups.systemStatus();
  }

  @Get('export')
  export(@Query() query: BackupListQueryDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', "attachment; filename*=UTF-8''backup-history.csv");
    return new StreamableFile(this.backups.exportCsv(query));
  }

  @Get()
  list(@Query() query: BackupListQueryDto) {
    return this.backups.list(query);
  }

  @Post()
  @ApiOperation({ summary: '立即创建 pg_dump custom format 备份并校验上传' })
  create(
    @Body() payload: CreateBackupDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.backups.createManual(actor, payload.locked, request.requestId);
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.backups.download(id);
    response.setHeader('content-type', file.mimeType);
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    return new StreamableFile(file.content);
  }

  @Post(':id/verify')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.backups.verify(id, actor, request.requestId);
  }

  @Patch(':id/lock')
  lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: LockBackupDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.backups.lock(id, payload.locked, actor, request.requestId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '密码与确认短语保护的一键恢复；自动创建 PRE_RESTORE' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: RestoreBackupDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.backups.restore(id, payload, actor, request.requestId);
  }
}

@ApiTags('Bootstrap Recovery')
@Public()
@AllowDuringMaintenance()
@Controller('bootstrap-recovery')
export class BootstrapRecoveryController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  @ApiOperation({ summary: '数据库无 Schema 或无管理员时检查 Bootstrap 恢复状态' })
  status() {
    return this.backups.bootstrapStatus();
  }

  @Post('restore')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000_000 } }))
  @ApiOperation({ summary: '通过恢复密钥上传 .dump 并恢复空数据库' })
  restore(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() payload: BootstrapRestoreDto,
    @Headers('x-recovery-key') recoveryKey?: string,
  ) {
    return this.backups.bootstrapRestore(file, payload, recoveryKey);
  }
}
