import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthUser } from '../auth/auth.types';
import { FilesService } from './files.service';

@ApiTags('Product Images')
@ApiBearerAuth()
@Controller('files/products/:productId/images')
export class ProductImagesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  list(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.files.productImages(productId);
  }

  @Get(':fileAssetId/content')
  async content(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('fileAssetId', ParseUUIDPipe) fileAssetId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.files.productImageContent(productId, fileAssetId);
    response.setHeader('content-type', file.mimeType);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'private, max-age=300');
    response.setHeader(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    if (file.eTag) response.setHeader('etag', file.eTag);
    return new StreamableFile(file.content);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 12, { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.files.uploadProductImages(productId, files ?? [], actor, request.requestId);
  }

  @Delete(':imageId')
  @HttpCode(204)
  async remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.files.deleteProductImage(productId, imageId, actor, request.requestId);
  }
}
