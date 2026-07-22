import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  private reason: string | null = null;
  private since: Date | null = null;

  enter(reason: string): void {
    if (this.reason) {
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_ACTIVE',
        message: '系统正在执行维护任务，请稍后重试',
      });
    }
    this.reason = reason;
    this.since = new Date();
  }

  exit(): void {
    this.reason = null;
    this.since = null;
  }

  status() {
    return {
      active: Boolean(this.reason),
      reason: this.reason,
      since: this.since?.toISOString(),
    };
  }
}
