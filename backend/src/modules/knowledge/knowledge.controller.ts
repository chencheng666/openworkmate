import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto';
import { ExecuteKnowledgeToolDto } from './dto/execute-knowledge-tool.dto';
import { ImportKnowledgeDocumentDto } from './dto/import-knowledge-document.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('tool-declarations')
  listToolDeclarations() {
    return this.knowledge.listToolDeclarations();
  }

  @Post('runtime/execute')
  executeTool(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: ExecuteKnowledgeToolDto,
  ) {
    return this.knowledge.executeTool(contextFromHeaders(headers), dto);
  }

  @Post('documents')
  createDocument(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: CreateKnowledgeDocumentDto) {
    return this.knowledge.createDocument(contextFromHeaders(headers), dto);
  }

  @Post('documents/import')
  importDocument(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: ImportKnowledgeDocumentDto,
  ) {
    return this.knowledge.importDocument(contextFromHeaders(headers), dto);
  }

  @Get('documents')
  listDocuments(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('category') category?: string,
  ) {
    return this.knowledge.listDocuments(contextFromHeaders(headers), category);
  }

  @Get('documents/:id')
  getDocument(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.knowledge.getDocument(contextFromHeaders(headers), id);
  }

  @Patch('documents/:id')
  updateDocument(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
  ) {
    return this.knowledge.updateDocument(contextFromHeaders(headers), id, dto);
  }

  @Post('documents/:id/archive')
  archiveDocument(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.knowledge.setDocumentArchived(contextFromHeaders(headers), id, true);
  }

  @Post('documents/:id/restore')
  restoreDocument(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.knowledge.setDocumentArchived(contextFromHeaders(headers), id, false);
  }

  @Delete('documents/:id')
  deleteDocument(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.knowledge.deleteDocument(contextFromHeaders(headers), id);
  }

  @Post('documents/:id/ingestion-runs')
  startIngestion(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.knowledge.startIngestion(contextFromHeaders(headers), id);
  }

  @Post('search')
  search(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: SearchKnowledgeDto) {
    return this.knowledge.search(contextFromHeaders(headers), dto);
  }
}
