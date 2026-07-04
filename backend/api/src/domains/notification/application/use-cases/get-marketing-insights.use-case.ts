import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

interface MarketingInsightsOutput {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  openRate: number;
  clickRate: number;
  chartData: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
  }>;
}

@Injectable()
export class GetMarketingInsightsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(tenantId: string): Promise<MarketingInsightsOutput> {
    // 1. Get total metrics
    const [totalSent, totalOpened, totalClicked] = await Promise.all([
      this.prisma.tenantNotification.count({
        where: { tenantId, templateId: { not: null } }
      }),
      this.prisma.tenantNotification.count({
        where: { tenantId, templateId: { not: null }, isRead: true }
      }),
      this.prisma.tenantNotification.count({
        where: { tenantId, templateId: { not: null }, clickedAt: { not: null } }
      })
    ]);

    // 2. Generate chart data for the last 7 days
    const chartData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [daySent, dayOpened, dayClicked] = await Promise.all([
        this.prisma.tenantNotification.count({
          where: {
            tenantId,
            templateId: { not: null },
            createdAt: { gte: date, lt: nextDate }
          }
        }),
        this.prisma.tenantNotification.count({
          where: {
            tenantId,
            templateId: { not: null },
            isRead: true,
            createdAt: { gte: date, lt: nextDate }
          }
        }),
        this.prisma.tenantNotification.count({
          where: {
            tenantId,
            templateId: { not: null },
            clickedAt: { not: null },
            createdAt: { gte: date, lt: nextDate }
          }
        })
      ]);

      chartData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sent: daySent,
        opened: dayOpened,
        clicked: dayClicked,
      });
    }

    return {
      totalSent,
      totalOpened,
      totalClicked,
      openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
      clickRate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
      chartData,
    };
  }
}
