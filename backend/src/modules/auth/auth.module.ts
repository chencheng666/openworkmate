import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OidcAuthService } from './oidc-auth.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OidcLoginState, OidcLoginStateSchema } from './oidc-login-state.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: OidcLoginState.name, schema: OidcLoginStateSchema }])],
  controllers: [AuthController],
  providers: [OidcAuthService],
})
export class AuthModule {}
