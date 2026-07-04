import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Delete, 
  Body, 
  Param, 
  Req, 
  UseGuards, 
  HttpCode, 
  HttpStatus
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import { Roles } from '../../../../shared/guards/roles.decorator';

// Shared API Contracts
import { CreateTableRequest, UpdateTableRequest, TableResponse } from '@xfos/contracts-bff-admin';

// DDD Application Use Cases
import { GetTablesUseCase } from '../../../../domains/table/application/use-cases/get-tables.use-case';
import { CreateTableUseCase } from '../../../../domains/table/application/use-cases/create-table.use-case';
import { UpdateTableUseCase } from '../../../../domains/table/application/use-cases/update-table.use-case';
import { DeleteTableUseCase } from '../../../../domains/table/application/use-cases/delete-table.use-case';
import { TrackPrintUseCase } from '../../../../domains/table/application/use-cases/track-print.use-case';

interface AuthenticatedRequest extends Request {
  user: { sub: string; roles: string[] };
  tenantId: string; // Inject by TenantAuthGuard
}

@Controller('admin/tables')
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF')
export class TableController {
  constructor(
    private readonly getTablesUseCase: GetTablesUseCase,
    private readonly createTableUseCase: CreateTableUseCase,
    private readonly updateTableUseCase: UpdateTableUseCase,
    private readonly deleteTableUseCase: DeleteTableUseCase,
    private readonly trackPrintUseCase: TrackPrintUseCase,
  ) {}

  @Get()
  async getTables(@Req() req: AuthenticatedRequest): Promise<TableResponse[]> {
    const tables = await this.getTablesUseCase.execute(req.tenantId, req.user.sub);
    return tables.map((t) => ({
      id: t.id,
      name: t.label,
      capacity: t.capacity,
      status: t.currentStatus.toLowerCase() as any,
      qrToken: t.qrToken,
      image: t.area,
    }));
  }

  @Post()
  async createTable(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateTableRequest,
  ): Promise<TableResponse> {
    const table = await this.createTableUseCase.execute(req.tenantId, req.user.sub, body);
    return {
      id: table.id,
      name: table.label,
      capacity: table.capacity,
      status: table.currentStatus.toLowerCase() as any,
      qrToken: table.qrToken,
      image: table.area,
    };
  }

  @Put(':id')
  async updateTable(
    @Req() req: AuthenticatedRequest,
    @Param('id') tableId: string,
    @Body() body: UpdateTableRequest,
  ): Promise<TableResponse> {
    const table = await this.updateTableUseCase.execute(req.tenantId, tableId, body);
    return {
      id: table.id,
      name: table.label,
      capacity: table.capacity,
      status: table.currentStatus.toLowerCase() as any,
      qrToken: table.qrToken,
      image: table.area,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTable(
    @Req() req: AuthenticatedRequest,
    @Param('id') tableId: string,
  ) {
    await this.deleteTableUseCase.execute(req.tenantId, tableId, req.user.sub);
  }

  @Post(':id/qr/print')
  @HttpCode(HttpStatus.OK)
  async trackPrint(
    @Req() req: AuthenticatedRequest,
    @Param('id') tableId: string,
  ) {
    await this.trackPrintUseCase.execute(req.tenantId, tableId);
    return { success: true };
  }
}
