import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {PassportModule} from '@nestjs/passport';
import {AuthController} from './auth.controller';
import {AuthService} from './auth.service';
import {JwtAccessStrategy, JwtRefreshStrategy} from './strategies';

@Module({
    imports: [
        PassportModule.register({defaultStrategy: 'jwt-access'}),
        JwtModule.register({}),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
    exports: [AuthService],
})
export class AuthModule {
}
