import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { validateEnvironment } from './config/environment'
import { DatabaseModule } from './database/database.module'
import { AuditModule } from './modules/audit/audit.module'
import { AuthGuard } from './modules/auth/auth.guard'
import { AuthModule } from './modules/auth/auth.module'
import { BackupModule } from './modules/backup/backup.module'
import { MaintenanceGuard } from './modules/backup/maintenance.guard'
import { FilesModule } from './modules/files/files.module'
import { HealthModule } from './modules/health/health.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { MasterDataModule } from './modules/master-data/master-data.module'
import { PurchaseModule } from './modules/purchase/purchase.module'
import { QualityModule } from './modules/quality/quality.module'
import { FinanceModule } from './modules/finance/finance.module'
import { SalesModule } from './modules/sales/sales.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            '*.password',
            '*.token',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    BackupModule,
    FilesModule,
    MasterDataModule,
    InventoryModule,
    PurchaseModule,
    QualityModule,
    FinanceModule,
    SalesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
