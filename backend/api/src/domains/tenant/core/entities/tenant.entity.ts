import { 
  TenantStatusEnum, 
  TenantStatus, 
  ServiceModelEnum, 
  ServiceModel 
} from '@xfos/contracts-enums';
import { TenantSettings, TenantOperatingHour, TenantPaymentMethod } from '@xfos/contracts-tenant';

export interface TenantProps {
  id: string;
  slug: string;
  nameEn: string;
  nameKm?: string | null;
  codePrefix: string;
  status: TenantStatus;
  serviceModel: ServiceModel;
  settings?: TenantSettings;
  operatingHours?: TenantOperatingHour[];
  paymentMethods?: TenantPaymentMethod[];
}

export class Tenant {
  constructor(private props: TenantProps) {}

  get id(): string { return this.props.id; }
  get slug(): string { return this.props.slug; }
  get nameEn(): string { return this.props.nameEn; }
  get nameKm(): string | null | undefined { return this.props.nameKm; }
  get codePrefix(): string { return this.props.codePrefix; }
  get name(): string { return this.props.nameEn; } // Legacy getter for compatibility
  get status(): TenantStatus { return this.props.status; }
  get serviceModel(): ServiceModel { return this.props.serviceModel; }
  get settings(): TenantSettings | undefined { return this.props.settings; }
  get operatingHours(): TenantOperatingHour[] { return this.props.operatingHours || []; }
  get paymentMethods(): TenantPaymentMethod[] { return this.props.paymentMethods || []; }

  /**
   * Business Logic: Is the merchant currently accepting orders?
   */
  get isActive(): boolean {
    return this.props.status === TenantStatusEnum.Enum.ACTIVE;
  }

  get isKiosk(): boolean {
    return this.props.serviceModel === ServiceModelEnum.Enum.STALL_KIOSK;
  }

  get isDineIn(): boolean {
    return this.props.serviceModel === ServiceModelEnum.Enum.DINE_IN_TABLE;
  }

  /**
   * Updates core merchant profile data.
   */
  updateProfile(props: Partial<Pick<TenantProps, 'nameEn' | 'nameKm' | 'codePrefix' | 'slug' | 'serviceModel'>>): void {
    if (props.nameEn) this.props.nameEn = props.nameEn;
    if (props.nameKm !== undefined) this.props.nameKm = props.nameKm;
    if (props.codePrefix) this.props.codePrefix = props.codePrefix;
    if (props.slug) this.props.slug = props.slug;
    if (props.serviceModel) this.props.serviceModel = props.serviceModel;
  }

  /**
   * Initializes default settings for a newly created tenant.
   */
  initializeDefaultSettings(description?: string | null): void {
    this.props.settings = {
      description,
      primaryColor: '#E07B39',
      defaultLocale: 'km',
      currency: 'USD',
      timezone: 'Asia/Phnom_Penh',
      taxRateBps: 0,
      taxInclusive: true,
      autoAcceptOrders: true,
      paymentTiming: 'PAY_BEFORE',
    } as TenantSettings;
  }

  /**
   * Overwrites the current tenant settings.
   * Deep-merging logic should be handled by the application layer or a domain service.
   */
  setSettings(newSettings: TenantSettings): void {
    this.props.settings = newSettings;
  }

  setOperatingHours(hours: TenantOperatingHour[]): void {
    this.props.operatingHours = hours;
  }

  setPaymentMethods(methods: TenantPaymentMethod[]): void {
    this.props.paymentMethods = methods;
  }
}
