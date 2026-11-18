import { BadRequestException, Body, ConflictException, Controller, Get, Header, Headers, HttpCode, Injectable, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Post, Res } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsIn, IsString, Length } from 'class-validator';
import { Model, Schema, isObjectIdOrHexString } from 'mongoose';
import type { FastifyReply } from 'fastify';
import { contextFromHeaders, type RequestContext } from '../../common/request-context';
import { formats, renderFile, type Format } from './render';

type Status = 'queued' | 'running' | 'ready' | 'failed';
class CreateResult {
  @IsIn(Object.keys(formats)) format!: Format;
  @IsString() @Length(1, 72) title!: string;
  @IsString() @Length(1, 12000) content!: string;
}
type Result = CreateResult & { tenantId: string; userId: string; status: Status; bytes?: Buffer; size: number; error?: string; createdAt: Date; updatedAt: Date; expiresAt: Date };
type H = Record<string,string|string[]|undefined>;
const schema = new Schema({ tenantId: String, userId: String, title: String, format: String, content: { type: String, select: false }, status: String,
  bytes: { type: Buffer, select: false }, size: Number, error: String, expiresAt: Date }, { collection: 'file_results', timestamps: true });
schema.index({ tenantId: 1, userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
function owner(ctx: RequestContext) { return { tenantId: ctx.tenantId, userId: ctx.userId, expiresAt: { $gt: new Date() } }; }
function meta(r: Omit<Result, 'bytes' | 'content'> & { _id: unknown }) {
  return { id: String(r._id), title: r.title, filename: r.title+'.'+r.format, format: r.format, status: r.status, size: r.size, error: r.error, createdAt: r.createdAt, expiresAt: r.expiresAt };
}
@Injectable()
export class ResultQueue implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectModel('FileResult') readonly jobs: Model<Result>) {}
  async saveIllustration(ctx: RequestContext, subject: string, bytes: Buffer) {
    if (!bytes.length || bytes.length > 8*1024*1024) throw new BadRequestException('图片超过文件大小限制。');
    const title = subject.replace(/[^\p{L}\p{N} _-]/gu,' ').trim().slice(0,68) || '插画';
    return meta(await this.jobs.create({tenantId:ctx.tenantId, userId:ctx.userId, title, format:'png',
      bytes, size:bytes.length, status:'ready', expiresAt:new Date(Date.now()+7*86400000)}));
  }
  private timer?: NodeJS.Timeout;
  private busy = false;
  private nextRecovery = 0;
  onModuleInit() { this.timer = setInterval(() => void this.tick().catch(() => undefined), 700); this.timer.unref(); }
  onModuleDestroy() { clearInterval(this.timer); }
  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if(Date.now() >= this.nextRecovery){
        await this.jobs.updateMany({ status: 'running', updatedAt: { $lt: new Date(Date.now()-300000) } }, { $set: { status: 'failed', error: '任务已中断，请重试。' } });
        this.nextRecovery = Date.now()+60000;
      }
      const job = await this.jobs.findOneAndUpdate({ status:'queued', expiresAt:{ $gt:new Date() } }, { $set:{ status:'running' } }, { sort:{ createdAt:1 }, new:true }).select('+content');
      if (!job) return;
      try {
        const bytes = await renderFile(job.format, job.title, job.content);
        if (!bytes.length || bytes.length > 8*1024*1024) throw new Error();
        await this.jobs.updateOne({ _id:job._id, status:'running' }, { $set:{ bytes, size:bytes.length, status:'ready' } });
      } catch { await this.jobs.updateOne({ _id:job._id, status:'running' }, { $set:{ status:'failed', error:'渲染失败，请检查编码器、字体或缩短内容后重试。' } }); }
    } finally { this.busy = false; }
  }
}
@Controller('results')
class ResultsController {
  constructor(private readonly queue: ResultQueue) {}
  @Get() @Header('Cache-Control','private, no-store')
  async list(@Headers() headers: H) {
    return (await this.queue.jobs.find(owner(contextFromHeaders(headers))).sort({ createdAt:-1 }).limit(100).lean()).map(meta);
  }
  @Post() @HttpCode(202)
  async create(@Headers() headers: H, @Body() body: CreateResult) {
    const ctx = contextFromHeaders(headers);
    const title = body.title.trim().replace(/[^\p{L}\p{N} _-]/gu, '_');
    if (!title || !body.content.trim()) throw new BadRequestException('文件名称和正文不能为空。');
    if (await this.queue.jobs.countDocuments({ ...owner(ctx), status:{ $in:['queued','running'] } }) >= 8) throw new ConflictException('生成队列已满，请稍后再试。');
    return meta(await this.queue.jobs.create({ tenantId:ctx.tenantId, userId:ctx.userId, title, format:body.format, content:body.content,
      status:'queued', size:0, expiresAt:new Date(Date.now()+7*86400000) }));
  }
  @Get(':id/preview') @Header('Cache-Control','private, no-store')
  async preview(@Headers() headers: H, @Param('id') id:string) {
    const scope = owner(contextFromHeaders(headers));
    if (!isObjectIdOrHexString(id)) throw new NotFoundException();
    const job = await this.queue.jobs.findOne({ ...scope, _id:id, format:'xlsx' }).select('+bytes');
    if (!job) throw new NotFoundException();
    if (job.status !== 'ready' || !job.bytes) throw new ConflictException('文件尚未就绪。');
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    await workbook.xlsx.load(Uint8Array.from(job.bytes).buffer);
    const sheet = workbook.worksheets[0];
    return { rows: Array.from({length: Math.min(sheet.rowCount,100)}, (_,i) =>
      Array.from({length: Math.min(sheet.columnCount,30)}, (_,j) => sheet.getCell(i+1,j+1).text)) };
  }
  @Get(':id/file')
  async file(@Headers() headers: H, @Param('id') id:string, @Res() reply:FastifyReply) {
    const scope = owner(contextFromHeaders(headers));
    if (!isObjectIdOrHexString(id)) throw new NotFoundException();
    const job = await this.queue.jobs.findOne({ ...scope, _id:id }).select('+bytes');
    if (!job) throw new NotFoundException('未找到此文件。');
    if (job.status !== 'ready' || !job.bytes) throw new ConflictException('文件尚未就绪。');
    return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff')
      .header('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(meta(job).filename)).type(formats[job.format]).send(Buffer.from(job.bytes));
  }
}
@Module({ imports:[MongooseModule.forFeature([{ name:'FileResult',schema }])], providers:[ResultQueue],controllers:[ResultsController],exports:[ResultQueue] })
export class ResultsModule {}
