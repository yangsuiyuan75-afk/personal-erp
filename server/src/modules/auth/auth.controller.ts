import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import type { RequestWithId } from '../../common/middleware/request-id.middleware'
import { AuthService } from './auth.service'
import type { AuthUser } from './auth.types'
import { ChangePasswordDto, CredentialsDto } from './dto/auth.dto'

const COOKIE_NAME = 'perp_refresh'

function setRefreshCookie(response: Response, token: string, expires: Date): void {
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/api/v1/auth',
  })
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('status')
  status() {
    return this.authService.status()
  }

  @Public()
  @Post('bootstrap')
  @ApiOperation({ summary: '首次创建本地管理员' })
  async bootstrap(
    @Body() dto: CredentialsDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.bootstrap(dto, request.requestId)
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt)
    return { user: result.user, accessToken: result.accessToken }
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: CredentialsDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, request.requestId)
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt)
    return { user: result.user, accessToken: result.accessToken }
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.refresh(request.cookies?.[COOKIE_NAME])
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt)
    return { user: result.user, accessToken: result.accessToken }
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: RequestWithId, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(request.cookies?.[COOKIE_NAME], undefined, request.requestId)
    response.clearCookie(COOKIE_NAME, { path: '/api/v1/auth' })
    return { success: true }
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id)
  }

  @ApiBearerAuth()
  @Patch('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: RequestWithId,
  ) {
    await this.authService.changePassword(user, dto, request.requestId)
    return { success: true }
  }
}
