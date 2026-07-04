export interface TableProps {
  tenantId: string;
  id: string;
  floorPlanId: string;
  label: string;
  capacity?: number | null;
  area?: string | null; // Stores image URL
  shape: 'RECTANGLE' | 'CIRCLE';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  currentStatus: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  version: number;
  notes?: string | null;
  isActive: boolean;
  qrToken?: string | null; // Loaded dynamically
}

export class RestaurantTable {
  constructor(private readonly props: TableProps) {}

  get tenantId(): string { return this.props.tenantId; }
  get id(): string { return this.props.id; }
  get floorPlanId(): string { return this.props.floorPlanId; }
  get label(): string { return this.props.label; }
  get capacity(): number { return this.props.capacity ?? 4; }
  get area(): string | null { return this.props.area ?? null; } // Maps to table image URL
  get shape(): 'RECTANGLE' | 'CIRCLE' { return this.props.shape; }
  get positionX(): number { return this.props.positionX; }
  get positionY(): number { return this.props.positionY; }
  get width(): number { return this.props.width; }
  get height(): number { return this.props.height; }
  get rotation(): number { return this.props.rotation; }
  get currentStatus(): 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' { return this.props.currentStatus; }
  get version(): number { return this.props.version; }
  get notes(): string | null { return this.props.notes ?? null; }
  get isActive(): boolean { return this.props.isActive; }
  get qrToken(): string | null { return this.props.qrToken ?? null; }

  updateDetails(details: { name?: string; capacity?: number; status?: string; image?: string | null }): void {
    if (details.name !== undefined) {
      if (!details.name.trim()) throw new Error('Table name cannot be empty');
      (this.props as any).label = details.name.trim();
    }
    if (details.capacity !== undefined) {
      if (details.capacity <= 0) throw new Error('Capacity must be greater than zero');
      (this.props as any).capacity = details.capacity;
    }
    if (details.status !== undefined) {
      const upperStatus = details.status.toUpperCase();
      if (!['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'].includes(upperStatus)) {
        throw new Error(`Invalid table status: ${details.status}`);
      }
      (this.props as any).currentStatus = upperStatus;
    }
    if (details.image !== undefined) {
      (this.props as any).area = details.image || null;
    }
  }

  setQrToken(token: string): void {
    (this.props as any).qrToken = token;
  }

  softDelete(): void {
    (this.props as any).isActive = false;
  }
}
