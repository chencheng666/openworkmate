import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OidcLoginStateRecord = HydratedDocument<OidcLoginState>;

@Schema({ timestamps: true, collection: 'oidc_login_states' })
export class OidcLoginState {
  @Prop({ type: String, required: true, unique: true })
  state!: string;

  @Prop({ type: String, required: true })
  nonce!: string;

  @Prop({ type: Date, required: true, index: true, expires: 0 })
  expiresAt!: Date;
}

export const OidcLoginStateSchema = SchemaFactory.createForClass(OidcLoginState);
