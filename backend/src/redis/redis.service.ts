import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  // OTP expires in 5 minutes (300 seconds)
  private readonly OTP_TTL = 300;

  // Refresh token expires in 7 days (7 * 24 * 60 * 60 seconds)
  private readonly REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis(
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async setOtp(email: string, otp: string): Promise<void> {
    const key = `otp:${email}`;
    await this.client.setex(key, this.OTP_TTL, otp);
  }

  async getOtp(email: string): Promise<string | null> {
    const key = `otp:${email}`;
    return this.client.get(key);
  }

  async deleteOtp(email: string): Promise<void> {
    const key = `otp:${email}`;
    await this.client.del(key);
  }

  async blacklistToken(token: string, userId: string): Promise<void> {
    const key = `blacklist:${token}`;
    await this.client.setex(key, this.REFRESH_TOKEN_TTL, userId);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const result = await this.client.exists(key);
    return result === 1;
  }
}
