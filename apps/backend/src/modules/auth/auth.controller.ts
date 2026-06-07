/**
 * AuthController — REST endpoints for sign-up / log-in / log-out / forgot / me.
 *
 * All cookie settings are identical: httpOnly + sameSite=lax + secure (prod).
 * Login/Signup auto-set the cookie and return the user in the JSON body (for frontend redirect).
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@scrape/shared';
import type {
  SignupInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@scrape/shared';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  isProduction,
} from './auth.constants';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @UsePipes(new ZodValidationPipe(signupSchema))
  async signup(
    @Body() body: SignupInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.signUp(body);
    setAuthCookie(res, session.token);
    return { user: session.user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.logIn(body);
    setAuthCookie(res, session.token);
    return { user: session.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { success: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: ForgotPasswordInput) {
    const result = await this.authService.issueResetToken(body.email);
    // Against email enumeration: always the same message.
    // In dev mode we attach the token to the response; in prod an email is sent.
    return {
      message:
        'Eğer bu email adresi sistemde varsa, sıfırlama linki gönderildi.',
      devToken: isProduction() ? null : result.token,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(
    @Body() body: ResetPasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.resetPassword(body.token, body.password);
    setAuthCookie(res, session.token);
    return { user: session.user };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getProfile(user.id);
    return profile;
  }
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
  });
}
