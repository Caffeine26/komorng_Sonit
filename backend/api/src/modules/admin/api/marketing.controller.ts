import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ManageTemplatesUseCase } from '../../../domains/notification/application/use-cases/manage-templates.use-case';
import { SendCrmBroadcastUseCase } from '../../../domains/notification/application/use-cases/send-crm-broadcast.use-case';
import { GetMarketingInsightsUseCase } from '../../../domains/notification/application/use-cases/get-marketing-insights.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../shared/guards/tenant-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/guards/roles.decorator';
import { 
  CreateNotificationTemplateRequestDto,
  UpdateNotificationTemplateRequestDto,
  SendCrmBroadcastRequestDto,
  GetNotificationTemplatesResponseDto,
  SendCrmBroadcastResponseDto,
  MarketingInsightsResponseDto
} from '@xfos/contracts-bff-admin';

@Controller('admin/:tenantSlug/marketing')
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER')
export class MarketingController {
  constructor(
    private readonly manageTemplatesUseCase: ManageTemplatesUseCase,
    private readonly sendCrmBroadcastUseCase: SendCrmBroadcastUseCase,
    private readonly getMarketingInsightsUseCase: GetMarketingInsightsUseCase,
  ) {}

  @Get('insights')
  async getInsights(
    @Param('tenantSlug') tenantSlug: string,
    @Request() req: any
  ): Promise<MarketingInsightsResponseDto> {
    const tenantId = req.tenantId;
    return await this.getMarketingInsightsUseCase.execute(tenantId);
  }

  @Get('templates')
  async listTemplates(@Request() req: any): Promise<GetNotificationTemplatesResponseDto> {
    const tenantId = req.tenantId;
    const templates = await this.manageTemplatesUseCase.list(tenantId);
    
    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        title: t.title,
        body: t.body,
        icon: t.icon,
        buttonText: t.buttonText,
        actionUrl: t.actionUrl,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  @Post('templates')
  async createTemplate(
    @Request() req: any,
    @Body() body: CreateNotificationTemplateRequestDto,
  ) {
    const tenantId = req.tenantId;
    const template = await this.manageTemplatesUseCase.create({
      tenantId,
      name: body.name,
      title: body.title,
      body: body.body,
      icon: body.icon ?? undefined,
      buttonText: body.buttonText ?? undefined,
      actionUrl: body.actionUrl ?? undefined,
    });
    
    return template;
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateNotificationTemplateRequestDto,
  ) {
    const tenantId = req.tenantId;
    // Pass null explicitly so Prisma will clear the column when the user removes a button
    const template = await this.manageTemplatesUseCase.update({
      tenantId,
      id,
      name: body.name,
      title: body.title,
      body: body.body,
      icon: body.icon !== undefined ? body.icon : undefined,
      buttonText: body.buttonText !== undefined ? body.buttonText : undefined,
      actionUrl: body.actionUrl !== undefined ? body.actionUrl : undefined,
    });
    
    return template;
  }

  @Delete('templates/:id')
  async deleteTemplate(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const tenantId = req.tenantId;
    await this.manageTemplatesUseCase.delete(tenantId, id);
    return { success: true };
  }

  @Post('broadcasts/send')
  async sendBroadcast(
    @Request() req: any,
    @Body() body: SendCrmBroadcastRequestDto,
  ): Promise<SendCrmBroadcastResponseDto> {
    const tenantId = req.tenantId;
    
    await this.sendCrmBroadcastUseCase.execute({
      tenantId,
      templateId: body.templateId,
      customerIds: body.customerIds,
    });
    
    return {
      success: true,
      sentCount: body.customerIds.length,
    };
  }
}
