import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { BackupController, BootstrapRecoveryController } from './backup.controller';
import { BackupService } from './backup.service';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceService } from './maintenance.service';
import { PostgresBackupRunner } from './postgres-backup.runner';

@Module({
  imports: [AuditModule, AuthModule, FilesModule],
  controllers: [BackupController, BootstrapRecoveryController],
  providers: [BackupService, MaintenanceService, MaintenanceGuard, PostgresBackupRunner],
  exports: [BackupService, MaintenanceService, MaintenanceGuard],
})
export class BackupModule {}
