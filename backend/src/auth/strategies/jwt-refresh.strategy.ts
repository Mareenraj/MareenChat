import {Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy} from 'passport-jwt';
import {ConfigService} from '@nestjs/config';
import {Request} from 'express';
import {RedisService} from '../../redis/redis.service';

export interface JwtRefreshPayload {
    sub: string; // User ID
    email: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor(
        private configService: ConfigService,
        private redisService: RedisService,
    ) {
        const secret = configService.get<string>('JWT_REFRESH_SECRET');
        if (!secret) {
            throw new Error('JWT_REFRESH_SECRET is not defined');
        }
        super({
            jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
            ignoreExpiration: false,
            secretOrKey: secret,
            passReqToCallback: true,
        });
    }

    async validate(req: Request, payload: JwtRefreshPayload) {
        const refreshToken = req.body.refreshToken;

        // Check if token is blacklisted
        const isBlacklisted = await this.redisService.isTokenBlacklisted(refreshToken);
        if (isBlacklisted) {
            throw new UnauthorizedException('Token has been revoked');
        }

        return {
            userId: payload.sub,
            email: payload.email,
            refreshToken,
        };
    }
}
