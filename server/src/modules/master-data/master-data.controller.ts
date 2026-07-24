import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ListQueryDto } from '../../common/dto/list-query.dto'
import type { RequestWithId } from '../../common/middleware/request-id.middleware'
import type { AuthUser } from '../auth/auth.types'
import { MasterDataPayloadDto } from './dto/master-data-payload.dto'
import { MasterDataService } from './master-data.service'

@ApiTags('Master Data')
@ApiBearerAuth()
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get(':resource/export')
  @ApiParam({ name: 'resource', example: 'categories' })
  export(
    @Param('resource') resource: string,
    @Query() query: ListQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.masterData.assertResource(resource)
    response.setHeader('content-type', 'text/csv; charset=utf-8')
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(resource)}.csv`,
    )
    return new StreamableFile(this.masterData.exportCsv(resource, query))
  }

  @Get(':resource')
  list(@Param('resource') resource: string, @Query() query: ListQueryDto) {
    return this.masterData.list(resource, query)
  }

  @Get(':resource/:id')
  detail(@Param('resource') resource: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.masterData.detail(resource, id)
  }

  @Post(':resource')
  create(
    @Param('resource') resource: string,
    @Body() payload: MasterDataPayloadDto,
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.masterData.create(resource, payload, user, request.requestId)
  }

  @Patch(':resource/:id')
  update(
    @Param('resource') resource: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: MasterDataPayloadDto,
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.masterData.update(resource, id, payload, user, request.requestId)
  }

  @Delete(':resource/:id')
  @HttpCode(204)
  async deactivate(
    @Param('resource') resource: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.masterData.deactivate(resource, id, user, request.requestId)
  }
}
