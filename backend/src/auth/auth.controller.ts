import {Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards,} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LoginDto, RefreshTokenDto, ResendOtpDto, SignupDto, VerifyOtpDto} from './dto';
import {JwtAuthGuard, JwtRefreshGuard} from './guards';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {
    }

    @Post('signup')
    @HttpCode(HttpStatus.CREATED)
    async signup(@Body() signupDto: SignupDto) {
        return this.authService.signup(signupDto);
    }

    @Post('verify-otp')
    @HttpCode(HttpStatus.OK)
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @Post('resend-otp')
    @HttpCode(HttpStatus.OK)
    async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
        return this.authService.resendOtp(resendOtpDto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('refresh')
    @UseGuards(JwtRefreshGuard)
    @HttpCode(HttpStatus.OK)
    async refreshTokens(@Req() req: any, @Body() refreshTokenDto: RefreshTokenDto) {
        const {userId, email} = req.user;
        return this.authService.refreshTokens(userId, email);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: any, @Body() body: RefreshTokenDto) {
        return this.authService.logout(req.user.id, body.refreshToken);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getProfile(@Req() req: any) {
        return this.authService.getProfile(req.user.id);
    }
}
