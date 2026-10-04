import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class WebChatHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(12000)
  content!: string;
}

export class WebChatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(12000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebChatHistoryMessageDto)
  history?: WebChatHistoryMessageDto[];
}
