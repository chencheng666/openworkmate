import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { CreateSkillSubmissionDto } from './dto/create-skill-submission.dto';
import { ReviewSkillSubmissionDto } from './dto/review-skill-submission.dto';
import { SetSkillEnabledDto } from './dto/set-skill-enabled.dto';
import { ExecuteSkillDto } from './dto/execute-skill.dto';
import { SkillFactoryService } from './skill-factory.service';

@ApiTags('skill-factory')
@Controller('skill-factory')
export class SkillFactoryController {
  constructor(private readonly skills: SkillFactoryService) {}

  @Post('submissions')
  submit(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: CreateSkillSubmissionDto) {
    return this.skills.submit(contextFromHeaders(headers), dto);
  }

  @Get('submissions')
  listSubmissions(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('status') status?: string,
  ) {
    return this.skills.listSubmissions(contextFromHeaders(headers), status);
  }

  @Post('submissions/:id/review')
  review(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: ReviewSkillSubmissionDto,
  ) {
    return this.skills.review(contextFromHeaders(headers), id, dto);
  }

  @Post('submissions/:id/publish')
  publish(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.skills.publish(contextFromHeaders(headers), id);
  }

  @Get('installed')
  listInstalled(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.skills.listInstalled(contextFromHeaders(headers));
  }

  @Post('runtime/execute')
  execute(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: ExecuteSkillDto,
  ) {
    return this.skills.execute(contextFromHeaders(headers), dto);
  }

  @Patch('installed/:id/enabled')
  setEnabled(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: SetSkillEnabledDto,
  ) {
    return this.skills.setEnabled(contextFromHeaders(headers), id, dto.enabled);
  }
}
