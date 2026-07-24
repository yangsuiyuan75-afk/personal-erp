import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MaintenanceService } from './maintenance.service'

const ALLOW_DURING_MAINTENANCE = 'allowDuringMaintenance'

export const AllowDuringMaintenance = () => SetMetadata(ALLOW_DURING_MAINTENANCE, true)

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly maintenance: MaintenanceService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.maintenance.status().active) return true
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_MAINTENANCE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (allowed) return true
    throw new ServiceUnavailableException({
      code: 'MAINTENANCE_ACTIVE',
      message: '数据库正在恢复，业务访问已暂时锁定',
    })
  }
}
