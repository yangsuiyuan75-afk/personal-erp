import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AllowDuringMaintenance } from '../backup/maintenance.guard';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public()
@AllowDuringMaintenance()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '检查 API 与数据库状态' })
  check(): Promise<Record<string, unknown>> {
    return this.healthService.check();
  }
}
