import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import type { RequestWithId } from '../middleware/request-id.middleware'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<RequestWithId>()
    const response = context.getResponse<Response>()
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const body = exception instanceof HttpException ? exception.getResponse() : null
    const payload = typeof body === 'object' && body ? (body as Record<string, unknown>) : {}
    const rawMessage =
      payload.message ?? (exception instanceof Error ? exception.message : '系统错误')
    const details = Array.isArray(rawMessage) ? rawMessage : []
    const message = Array.isArray(rawMessage)
      ? '请求参数不符合要求'
      : status >= 500
        ? '服务暂时不可用，请稍后重试'
        : String(rawMessage)

    if (status >= 500) {
      this.logger.error({ requestId: request.requestId, exception })
    }

    response.status(status).json({
      error: {
        code: String(payload.code ?? `HTTP_${status}`),
        message,
        details,
      },
      requestId: request.requestId,
    })
  }
}
