import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, Module, Put } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsIn, IsString, Length, MaxLength } from 'class-validator';
import { Model, Schema } from 'mongoose';
import { contextFromHeaders } from '../../common/request-context';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';

type IdentityHeaders = Record<string, string | string[] | undefined>;
const themes = ['ocean', 'jade', 'violet'];
class BrandInput {
  @IsString() @Length(1, 32) name!: string;
  @IsIn(themes) theme!: string;
  @IsString() @MaxLength(90000) logo!: string;
}
const schema = new Schema({
  tenantId: { type: String, required: true, unique: true },
  name: String, theme: String, logo: String,
}, { collection: 'tenant_branding', timestamps: true });

function checkLogo(logo: string) {
  if (!logo) return;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
  const data = Buffer.from(match?.[1] ?? '', 'base64');
  if (!match || data.length < 33 || data.length > 65536 ||
      data.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452' ||
      [16, 20].some((offset) => data.readUInt32BE(offset) < 1 || data.readUInt32BE(offset) > 512)) {
    throw new BadRequestException('请上传不超过 64 KB、宽高不超过 512 像素的 PNG 图标。');
  }
}

@Controller('branding')
class BrandingController {
  constructor(@InjectModel('TenantBrand') private readonly model: Model<BrandInput & { tenantId: string }>,
    private readonly audit: AuditService) {}

  @Get() @Header('Cache-Control', 'private, no-store')
  async read(@Headers() headers: IdentityHeaders) {
    const { tenantId } = contextFromHeaders(headers);
    return (await this.model.findOne({ tenantId }, 'name theme logo -_id').lean()) ??
      { name: 'OpenWorkMate', theme: 'ocean', logo: '' };
  }

  @Put()
  async update(@Headers() headers: IdentityHeaders, @Body() input: BrandInput) {
    const ctx = contextFromHeaders(headers);
    if (!ctx.roleIds.includes('platform-admin')) throw new ForbiddenException('仅平台管理员可修改企业外观。');
    const brand = { name: input.name.trim(), logo: input.logo, theme: input.theme };
    if (!brand.name) throw new BadRequestException('请填写工作台名称。');
    checkLogo(brand.logo);
    await this.model.updateOne({ tenantId: ctx.tenantId }, { $set: brand }, { upsert: true });
    await this.audit.record(ctx, { action: 'branding.update', resourceType: 'tenant_brand', resourceId: ctx.tenantId,
      detail: { name: brand.name, theme: brand.theme, customLogo: Boolean(brand.logo) } });
    return brand;
  }
}

@Module({ imports: [AuditModule, MongooseModule.forFeature([{ name: 'TenantBrand', schema }])],
  controllers: [BrandingController] })
export class BrandingModule {}
