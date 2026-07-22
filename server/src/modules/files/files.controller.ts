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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import {
  FileListQueryDto,
  ReorderProductImagesDto,
  UploadFileDto,
  UploadProductImagesDto,
} from './dto/files.dto';
import { FilesService } from './files.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('export')
  export(@Query() query: FileListQueryDto, @Res({ passthrough: true }) response: Response) {
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', "attachment; filename*=UTF-8''file-assets.csv");
    return new StreamableFile(this.files.exportCsv(query));
  }

  @Get('products/:productId/images')
  productImages(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.files.productImages(productId);
  }

  @Post('products/:productId/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 8, { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadProductImages(
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() payload: UploadProductImagesDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.uploadProductImages(
      productId,
      files ?? [],
      payload,
      actor,
      request.requestId,
    );
  }

  @Patch('products/:productId/images/reorder')
  reorderProductImages(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() payload: ReorderProductImagesDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.reorderProductImages(productId, payload, actor, request.requestId);
  }

  @Post('products/:productId/images/:imageId/primary')
  setPrimary(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.setPrimary(productId, imageId, actor, request.requestId);
  }

  @Delete('products/:productId/images/:imageId')
  @HttpCode(204)
  deleteProductImage(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.deleteProductImage(productId, imageId, actor, request.requestId);
  }

  @Get(':id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.files.content(id);
    response.setHeader('content-type', file.mimeType);
    response.setHeader('cache-control', 'private, max-age=300');
    response.setHeader(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    if (file.eTag) response.setHeader('etag', file.eTag);
    return new StreamableFile(file.content);
  }

  @Post(':id/retry')
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.retry(id, actor, request.requestId);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.files.detail(id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.delete(id, actor, request.requestId);
  }

  @Get()
  list(@Query() query: FileListQueryDto) {
    return this.files.list(query);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 250 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() payload: UploadFileDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.upload(file, payload, actor, request.requestId);
  }
}
