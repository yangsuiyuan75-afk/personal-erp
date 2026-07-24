import { randomUUID } from 'node:crypto'
import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

export type RequestWithId = Request & { requestId?: string }

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id')
    request.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID()
    response.setHeader('x-request-id', request.requestId)
    next()
  }
}
