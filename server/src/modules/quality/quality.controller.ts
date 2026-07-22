import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import {
  ConfirmQualityInspectionDto,
  CreateClaimSettlementDto,
  CreateQualityInspectionDto,
  QualityQueryDto,
} from './dto/quality.dto';
import { QualityService } from './quality.service';

@ApiTags('Quality')
@ApiBearerAuth()
@Controller('quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('pending-returns')
  pendingReturns(@Query() query: QualityQueryDto) {
    return this.quality.listPendingReturns(query);
  }

  @Get('inspections')
  inspections(@Query() query: QualityQueryDto) {
    return this.quality.listInspections(query);
  }

  @Post('inspections')
  createInspection(
    @Body() payload: CreateQualityInspectionDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.quality.createInspection(payload, actor, request.requestId);
  }

  @Post('inspections/:id/confirm')
  confirmInspection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: ConfirmQualityInspectionDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.quality.confirmInspection(id, payload, idempotencyKey, actor, request.requestId);
  }

  @Get('issues')
  issues(@Query() query: QualityQueryDto) {
    return this.quality.listIssues(query);
  }

  @Get('claims')
  claims(@Query() query: QualityQueryDto) {
    return this.quality.listClaims(query);
  }

  @Post('claims/:id/settlements')
  settleClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: CreateClaimSettlementDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.quality.settleClaim(id, payload, idempotencyKey, actor, request.requestId);
  }

  @Get('settlements')
  settlements(@Query() query: QualityQueryDto) {
    return this.quality.listSettlements(query);
  }

  @Get('stock')
  stock(@Query() query: QualityQueryDto) {
    return this.quality.listQualityStock(query);
  }

  @Get('compensation-receivables')
  compensationReceivables(@Query() query: QualityQueryDto) {
    return this.quality.listCompensationReceivables(query);
  }

  @Get('analytics')
  analytics(@Query() query: QualityQueryDto) {
    return this.quality.analytics(query);
  }
}
