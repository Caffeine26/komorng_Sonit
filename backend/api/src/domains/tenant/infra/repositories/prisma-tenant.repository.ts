import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ITenantRepository } from '../../core/ports/tenant.repository.port';
import { Tenant } from '../../core/entities/tenant.entity';
import { TenantMapper } from '../mappers/tenant.mapper';

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(tenant: Tenant): Promise<void> {
    const { id, ...updateData } = TenantMapper.toPersistence(tenant);
    
    try {
      await this.prisma.tenant.upsert({
        where: { id },
        update: {
          ...updateData,
          settings: tenant.settings ? {
            upsert: {
              where: { tenantId: id },
              create: {
                serviceModel: tenant.serviceModel,
                logoUrl: tenant.settings.logoUrl,
                coverImageUrl: tenant.settings.coverImageUrl,
                primaryColor: tenant.settings.primaryColor,
                socialLinks: {
                  ...((tenant.settings.socialLinks as any) || {}),
                  ...(tenant.settings.phone ? { phone: tenant.settings.phone } : {}),
                  ...(tenant.settings.facebookUrl ? { facebook: tenant.settings.facebookUrl } : {}),
                } as any,
                address: tenant.settings.address as any,
                description: tenant.settings.description as any,
              },
              update: {
                serviceModel: tenant.serviceModel,
                logoUrl: tenant.settings.logoUrl,
                coverImageUrl: tenant.settings.coverImageUrl,
                primaryColor: tenant.settings.primaryColor,
                defaultLocale: tenant.settings.defaultLocale as any,
                currency: tenant.settings.currency as any,
                timezone: tenant.settings.timezone,
                taxRateBps: tenant.settings.taxRateBps,
                taxInclusive: tenant.settings.taxInclusive,
                autoAcceptOrders: tenant.settings.autoAcceptOrders,
                payTiming: tenant.settings.paymentTiming as any,
                address: tenant.settings.address as any,
                description: tenant.settings.description as any,
                socialLinks: {
                  ...((tenant.settings.socialLinks as any) || {}),
                  ...(tenant.settings.phone ? { phone: tenant.settings.phone } : {}),
                  ...(tenant.settings.facebookUrl ? { facebook: tenant.settings.facebookUrl } : {}),
                } as any,
              }
            }
          } : undefined,
          operatingHours: {
            deleteMany: {},
            create: tenant.operatingHours.map(h => ({
              dayOfWeek: h.dayOfWeek,
              openTime: new Date(h.openTime),
              closeTime: new Date(h.closeTime),
              isClosed: h.isClosed,
            }))
          },
          paymentMethods: {
            deleteMany: {},
            create: tenant.paymentMethods.map(p => ({
              method: p.method as any,
              provider: p.provider,
              isEnabled: p.isEnabled,
              config: p.config as any,
            }))
          }
        },
        create: {
          id,
          ...updateData,
          settings: {
            create: {
              serviceModel: tenant.serviceModel,
              logoUrl: tenant.settings?.logoUrl,
              coverImageUrl: tenant.settings?.coverImageUrl,
              primaryColor: tenant.settings?.primaryColor,
              defaultLocale: (tenant.settings?.defaultLocale ?? 'km') as any,
              currency: (tenant.settings?.currency ?? 'USD') as any,
              timezone: tenant.settings?.timezone ?? 'Asia/Phnom_Penh',
              taxRateBps: tenant.settings?.taxRateBps ?? 0,
              taxInclusive: tenant.settings?.taxInclusive ?? true,
              autoAcceptOrders: tenant.settings?.autoAcceptOrders ?? true,
              payTiming: (tenant.settings?.paymentTiming ?? 'PAY_BEFORE') as any,
              address: tenant.settings?.address as any,
              description: tenant.settings?.description as any,
              socialLinks: {
                ...((tenant.settings?.socialLinks as any) || {}),
                ...(tenant.settings?.phone ? { phone: tenant.settings?.phone } : {}),
                ...(tenant.settings?.facebookUrl ? { facebook: tenant.settings?.facebookUrl } : {}),
              } as any,
            }
          }
        }
      });
    } catch (error) {
      console.error(`[PrismaTenantRepository] Failed to save tenant ${id}:`, error);
      throw error;
    }
  }

  async findById(id: string): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findUnique({
      where: { id },
      include: { 
        settings: true,
        operatingHours: true,
        paymentMethods: true
      }
    });
    return record ? TenantMapper.toDomain(record) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { 
        settings: true,
        operatingHours: true,
        paymentMethods: true
      }
    });
    return record ? TenantMapper.toDomain(record) : null;
  }

  async assignOwner(tenantId: string, userId: string): Promise<void> {
    await this.prisma.userRole.create({
      data: {
        userId,
        tenantId,
        role: 'TENANT_OWNER',
      },
    });
  }

  async existsByOwnerId(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: {
        userId,
        role: 'TENANT_OWNER',
      },
    });
    return count > 0;
  }
}
