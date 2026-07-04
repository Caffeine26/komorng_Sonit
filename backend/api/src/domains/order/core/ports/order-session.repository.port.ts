export const ORDER_SESSION_REPOSITORY_PORT = Symbol('ORDER_SESSION_REPOSITORY_PORT');

export interface QrContextDto {
  id: string;
  tenantId: string;
  token: string;
  tableId: string | null;
  activeSessionId: string | null;
  table?: { id: string; label: string } | null;
}

export interface OrderSessionDto {
  id: string;
  tenantId: string;
  status: string;
  qrContextId: string | null;
  tableId: string | null;
  tableRef: string | null;
  qrContext?: QrContextDto | null;
}

export interface IOrderSessionRepository {
  findSessionById(tenantId: string, sessionId: string): Promise<OrderSessionDto | null>;
  findActiveSession(tenantId: string, sessionId: string): Promise<OrderSessionDto | null>;
  findActiveSessionByQrContext(tenantId: string, qrContextId: string): Promise<OrderSessionDto | null>;
  findActiveSessionByTable(tenantId: string, tableId: string): Promise<OrderSessionDto | null>;
  createSession(tenantId: string, data: Partial<OrderSessionDto>): Promise<OrderSessionDto>;
  updateSession(tenantId: string, sessionId: string, data: Partial<OrderSessionDto>): Promise<void>;
  refreshSessionActivity(tenantId: string, sessionId: string): Promise<void>;
  
  findQrContextByTokenGlobal(token: string): Promise<any | null>;
  findQrContextByToken(tenantId: string, token: string): Promise<QrContextDto | null>;
  updateQrContextSession(tenantId: string, qrContextId: string, sessionId: string): Promise<void>;
  incrementQrScan(tenantId: string, qrContextId: string): Promise<void>;
  
  findTableById(tenantId: string, tableId: string): Promise<{ id: string; label: string } | null>;
}
