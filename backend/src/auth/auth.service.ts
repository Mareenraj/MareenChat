import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { LoginDto, ResendOtpDto, SignupDto, VerifyOtpDto } from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService,
    private emailService: EmailService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) { }

  async signup(signupDto: SignupDto) {
    const { email, password, name } = signupDto;

    // Check if user already exists
    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new ConflictException('User with this email already exists');
      }
      // User exists but not verified - update password and resend OTP
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
      await this.prismaService.user.update({
        where: { email },
        data: { password: hashedPassword, name },
      });

      // Generate and send OTP
      const otp = this.generateOtp();
      await this.redisService.setOtp(email, otp);
      await this.emailService.sendOtpEmail(email, otp, name);

      return {
        message:
          'OTP sent to your email. Please verify to complete registration.',
        email,
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Create user
    const user = await this.prismaService.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        isVerified: false,
      },
    });

    // Generate and send OTP
    const otp = this.generateOtp();
    await this.redisService.setOtp(email, otp);
    await this.emailService.sendOtpEmail(email, otp, name);

    this.logger.log(`User registered: ${email}`);

    return {
      message:
        'OTP sent to your email. Please verify to complete registration.',
      email: user.email,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;

    // Find user
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Get stored OTP
    const storedOtp = await this.redisService.getOtp(email);

    if (!storedOtp) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    if (storedOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Mark user as verified
    await this.prismaService.user.update({
      where: { email },
      data: { isVerified: true },
    });

    // Delete OTP from Redis
    await this.redisService.deleteOtp(email);

    this.logger.log(`User verified: ${email}`);

    return {
      message: 'Email verified successfully. You can now login.',
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { email } = resendOtpDto;

    // Find user
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate and send new OTP
    const otp = this.generateOtp();
    await this.redisService.setOtp(email, otp);
    await this.emailService.sendOtpEmail(email, otp, user.name);

    this.logger.log(`OTP resent to: ${email}`);

    return {
      message: 'OTP sent to your email.',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user is verified
    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    this.logger.log(`User logged in: ${email}`);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, email: string) {
    const tokens = await this.generateTokens(userId, email);

    this.logger.log(`Tokens refreshed for user: ${email}`);

    return {
      message: 'Tokens refreshed successfully',
      ...tokens,
    };
  }

  async logout(userId: string, refreshToken: string) {
    await this.redisService.blacklistToken(refreshToken, userId);

    this.logger.log(`User logged out: ${userId}`);

    return {
      message: 'Logged out successfully',
    };
  }

  async getProfile(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deleteAccount(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete user (messages are cascade deleted due to Prisma schema)
    await this.prismaService.user.delete({
      where: { id: userId },
    });

    this.logger.log(`User account deleted: ${user.email}`);

    return {
      message: 'Account deleted successfully',
    };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async generateTokens(userId: string, email: string) {
    const accessExpiresIn = Number(
      this.configService.get('JWT_ACCESS_EXPIRES_IN', 900),
    );
    const refreshExpiresIn = Number(
      this.configService.get('JWT_REFRESH_EXPIRES_IN', 604800),
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: accessExpiresIn,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
