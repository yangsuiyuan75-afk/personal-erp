import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
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
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import {
  CreateAdjustmentDto,
  CreateChannelAllocationDto,
  CreateLocationDto,
  CreateOpeningDto,
  CreateTransferDto,
  InventoryQueryDto,
  OpeningRowsDto,
  UpdateLocationDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('locations')
  listLocations(@Query() query: InventoryQueryDto) {
    return this.inventory.listLocations(query);
  }

  @Post('locations')
  createLocation(
    @Body() payload: CreateLocationDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.createLocation(payload, actor, request.requestId);
  }

  @Patch('locations/:id')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateLocationDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.updateLocation(id, payload, actor, request.requestId);
  }

  @Delete('locations/:id')
  @HttpCode(204)
  deactivateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.deactivateLocation(id, actor, request.requestId);
  }

  @Get('balances')
  balances(@Query() query: InventoryQueryDto) {
    return this.inventory.listBalances(query);
  }

  @Get('transactions')
  transactions(@Query() query: InventoryQueryDto) {
    return this.inventory.listTransactions(query);
  }

  @Get('transactions/:id')
  transaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.transaction(id);
  }

  @Get('batches')
  batches(@Query() query: InventoryQueryDto) {
    return this.inventory.listBatches(query);
  }

  @Get('openings/template')
  @Header('content-type', 'text/csv; charset=utf-8')
  openingTemplate(@Res({ passthrough: true }) response: Response) {
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('期初库存模板.csv')}`,
    );
    return new StreamableFile(this.inventory.openingTemplate());
  }

  @Post('openings/preview')
  previewOpening(@Body() payload: OpeningRowsDto) {
    return this.inventory.previewOpening(payload.rows);
  }

  @Post('openings/preview-file')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  previewOpeningFile(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: '请选择 CSV 文件' });
    const rows = this.inventory.openingRowsFromCsv(file.buffer);
    return this.inventory.previewOpening(rows);
  }

  @Get('openings')
  openings(@Query() query: InventoryQueryDto) {
    return this.inventory.listDocuments('openings', query);
  }

  @Post('openings')
  createOpening(
    @Body() payload: CreateOpeningDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.createOpening(payload, actor, request.requestId);
  }

  @Post('openings/:id/post')
  postOpening(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.postOpening(id, idempotencyKey, actor, request.requestId);
  }

  @Get('adjustments')
  adjustments(@Query() query: InventoryQueryDto) {
    return this.inventory.listDocuments('adjustments', query);
  }

  @Post('adjustments')
  createAdjustment(
    @Body() payload: CreateAdjustmentDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.createAdjustment(payload, actor, request.requestId);
  }

  @Post('adjustments/:id/post')
  postAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.postAdjustment(id, idempotencyKey, actor, request.requestId);
  }

  @Get('transfers')
  transfers(@Query() query: InventoryQueryDto) {
    return this.inventory.listDocuments('transfers', query);
  }

  @Post('transfers')
  createTransfer(
    @Body() payload: CreateTransferDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.createTransfer(payload, actor, request.requestId);
  }

  @Post('transfers/:id/post')
  postTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.postTransfer(id, idempotencyKey, actor, request.requestId);
  }

  @Post('channel-allocations')
  createChannelAllocation(
    @Body() payload: CreateChannelAllocationDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.inventory.createChannelAllocation(payload, actor, request.requestId);
  }
}
