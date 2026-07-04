import { Injectable, Logger } from '@nestjs/common';
import { IPdfGeneratorService } from '../../core/ports/pdf-generator.service.port';
import { OrderEntity } from '../../core/entities/order.entity';
import { Tenant } from '../../../tenant/core/entities/tenant.entity';

@Injectable()
export class PuppeteerPdfService implements IPdfGeneratorService {
  private readonly logger = new Logger(PuppeteerPdfService.name);

  async generateOrderReceipt(order: OrderEntity, tenant: Tenant, requestedLocale?: string): Promise<{ buffer: Buffer; orderNumber: string }> {
    this.logger.log(`Generating native HTML PDF for order ${order.orderNumber}`);

    // Format date like 'Jun 2, 2026, 16:15'
    const dateStr = new Date(order.createdAt || new Date()).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false
    });

    // Merge duplicate items if they have the same ID/options/notes
    const groupedItems = order.items.reduce((acc, item) => {
      const variantId = (item as any).variantSnapshot?.id || '';
      const optionsStr = (item as any).optionsSnapshot
        ? JSON.stringify((item as any).optionsSnapshot.map((o: any) => o.id).sort())
        : '';
      const notes = item.notes || '';
      const key = `${item.menuItemId}-${variantId}-${optionsStr}-${notes}`;

      if (acc[key]) {
        acc[key] = { ...acc[key], quantity: acc[key].quantity + item.quantity };
      } else {
        acc[key] = { ...item };
      }
      return acc;
    }, {} as Record<string, any>);

    const mergedItems = Object.values(groupedItems) as any[];

    // Fallback names
    const customerName = (order as any).customerName || "Guest";
    const tableName = order.tableRef && !order.tableRef.startsWith('tbl_') ? order.tableRef : "Phnom Penh";

    const subtotal = (order.totalCents / 100).toFixed(2);
    const total = (order.totalCents / 100).toFixed(2);
    const totalRiel = (order.totalCents * 40).toLocaleString(); // 1$ = 4000 Riel => cents * 40

    const locale = requestedLocale || order.locale || 'en';

    const t = {
      en: {
        thankYou: 'Thank you for your order!',
        receiptSummary: 'Here is your receipt summary',
        orderNo: 'Order No',
        orderTime: 'Order Time',
        table: 'Table',
        customer: 'Customer',
        no: 'No.',
        itemName: 'Item Name',
        qty: 'Qty',
        price: 'Price',
        subtotal: 'Subtotal',
        grandTotal: 'Grand Total',
        exchangeRate: 'Exchange Rate 1$ = 4000 Riel',
        size: 'Size:',
        addOn: 'Add on:',
        note: 'Note:'
      },
      km: {
        thankYou: 'សូមអរគុណសម្រាប់ការបញ្ជាទិញ!',
        receiptSummary: 'នេះគឺជាសេចក្ដីសង្ខេបវិក្កយបត្ររបស់អ្នក',
        orderNo: 'លេខការបញ្ជាទិញ',
        orderTime: 'ម៉ោងបញ្ជាទិញ',
        table: 'តុ',
        customer: 'អតិថិជន',
        no: 'ល.រ.',
        itemName: 'ឈ្មោះមុខទំនិញ',
        qty: 'បរិមាណ',
        price: 'តម្លៃ',
        subtotal: 'សរុបរង',
        grandTotal: 'សរុបរួម',
        exchangeRate: 'អត្រាប្តូរប្រាក់ 1$ = 4000 រៀល',
        size: 'ទំហំ:',
        addOn: 'បន្ថែម:',
        note: 'ចំណាំ:'
      }
    };

    const dict = locale === 'km' ? t.km : t.en;
    const tenantName = locale === 'km' && tenant.nameKm ? tenant.nameKm : tenant.nameEn;

    // Build Items HTML
    const itemsHtml = mergedItems.map((item, idx) => {
      const nameParts = (item.itemName || '').split(' / ');
      const nameKm = nameParts[0] || item.itemName;
      const nameEn = nameParts[1] || item.itemName;
      const itemName = locale === 'km' ? nameKm : nameEn;

      const price = ((item.unitPriceCents * item.quantity) / 100).toFixed(2);

      let variantsHtml = '';
      const variantName = locale === 'km' && item.variantSnapshot?.nameKm ? item.variantSnapshot?.nameKm : (item.variantSnapshot?.nameEn || item.variantSnapshot?.variantName);
      const options = item.optionsSnapshot || [];
      const notes = item.notes;

      if (variantName || options.length > 0 || notes) {
        variantsHtml += `<div class="flex flex-col gap-0.5 mt-1">`;
        if (variantName) {
          variantsHtml += `<div class="text-[11px] font-medium text-[#8F8F8F]">${dict.size} ${variantName}</div>`;
        }
        options.forEach((opt: any) => {
          const optName = locale === 'km' && opt.nameKm ? opt.nameKm : (opt.nameEn || opt.name);
          variantsHtml += `<div class="text-[11px] font-medium text-[#8F8F8F]">${dict.addOn} ${optName}`;
          if (opt.priceDeltaCents && opt.priceDeltaCents > 0) {
            variantsHtml += `<span class="opacity-60 ml-1">(+$${(opt.priceDeltaCents / 100).toFixed(2)})</span>`;
          }
          variantsHtml += `</div>`;
        });
        if (notes) {
          variantsHtml += `<div class="text-[11px] font-medium text-[#8F8F8F] italic mt-0.5">${dict.note} ${notes}</div>`;
        }
        variantsHtml += `</div>`;
      }

      return `
        <tr class="bg-white">
          <td class="px-3 py-3 font-normal text-[#333333] align-top">${idx + 1}</td>
          <td class="px-3 py-3 font-normal text-[#333333] align-top">
            <div class="text-[13px]">${itemName}</div>
            ${variantsHtml}
          </td>
          <td class="px-2 py-3 text-center font-normal text-[#333333] align-top">x${item.quantity}</td>
          <td class="px-3 py-3 text-right font-normal text-[#333333] align-top">$${price}</td>
        </tr>
      `;
    }).join('');

    const logoHtml = tenant.settings?.logoUrl
      ? `<img src="${tenant.settings.logoUrl}" alt="${tenantName}" style="width: 36px; height: 36px;" class="rounded-lg object-cover border border-zinc-100" />`
      : `<div class="w-9 h-9 rounded-lg bg-[#E91E63]/10 flex items-center justify-center text-[#E91E63] font-medium text-sm">${tenantName.charAt(0)}</div>`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Kantumruy Pro', sans-serif; background: white; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .receipt-container { width: 100%; max-width: 480px; }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100">
      <div class="flex items-center gap-3 mb-5">
        ${logoHtml}
        <h2 class="text-base font-medium text-[#333333]">${tenantName}</h2>
      </div>

      <div class="mb-5">
        <h3 class="text-base font-medium text-[#333333] mb-1">${dict.thankYou}</h3>
        <p class="text-[#333333] text-[13px]">${dict.receiptSummary}</p>
      </div>

      <div class="h-px w-full bg-black mb-5"></div>

      <div class="grid grid-cols-2 gap-y-5 mb-6">
        <div>
          <p class="text-[#333333] text-[11px] font-medium mb-1">${dict.orderNo}</p>
          <p class="text-[#333333] text-[13px] font-medium">#${order.orderNumber}</p>
        </div>
        <div>
          <p class="text-[#333333] text-[11px] font-medium mb-1">${dict.orderTime}</p>
          <p class="text-[#333333] text-[13px] font-medium">${dateStr}</p>
        </div>
        <div>
          <p class="text-[#333333] text-[11px] font-medium mb-1">${dict.table}</p>
          <p class="text-[#333333] text-[13px] font-medium">${tableName}</p>
        </div>
        <div>
          <p class="text-[#333333] text-[11px] font-medium mb-1">${dict.customer}</p>
          <p class="text-[#333333] text-[13px] font-medium">${customerName}</p>
        </div>
      </div>

      <div class="border border-[#333333] rounded-[12px] overflow-hidden mb-5">
        <table class="w-full text-[13px] border-collapse">
          <thead class="bg-white border-b border-[#333333]">
            <tr>
              <th class="px-3 py-2.5 text-left font-medium text-[#333333] w-[10%] text-[11px]">${dict.no}</th>
              <th class="px-3 py-2.5 text-left font-medium text-[#333333] w-1/2 text-[11px]">${dict.itemName}</th>
              <th class="px-2 py-2.5 text-center font-medium text-[#333333] w-[20%] text-[11px]">${dict.qty}</th>
              <th class="px-3 py-2.5 text-right font-medium text-[#333333] w-[20%] text-[11px]">${dict.price}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#333333]">
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <div class="border-t border-dashed border-[#333333] mb-5"></div>

      <div class="flex justify-end mb-5">
        <div class="w-[140px] flex justify-between items-center px-1">
          <span class="font-medium text-[#333333] text-[13px]">${dict.subtotal}</span>
          <span class="font-medium text-[#333333] text-[13px]">$${subtotal}</span>
        </div>
      </div>

      <div class="border border-[#333333] rounded-[14px] p-4 mb-2">
        <div class="flex justify-between items-center mb-4">
          <span class="text-base font-black text-[#333333]">${dict.grandTotal}</span>
          <span class="text-2xl font-black text-[#E91E63]">$${total}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[11px] font-medium text-[#333333] italic">${dict.exchangeRate}</span>
          <span class="text-[13px] font-black text-[#333333]">៛${totalRiel}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Use eval to prevent TypeScript from transpiling the dynamic import into a require() statement, which fails for ES Modules
    const puppeteer = await (eval('import("puppeteer")') as Promise<typeof import('puppeteer')>);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      await page.setContent(htmlContent, { waitUntil: 'load', timeout: 15000 });

      // Wait a little extra time for the Google Fonts to fully apply since load doesn't always guarantee fonts
      await new Promise(resolve => setTimeout(resolve, 800));

      const bodyHeight = await page.evaluate(() => {
        return (globalThis as any).document.documentElement.offsetHeight;
      }) as number;

      const pdfBuffer = await page.pdf({
        width: '480px',
        height: `${bodyHeight}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      return { buffer: Buffer.from(pdfBuffer), orderNumber: order.orderNumber };
    } catch (error) {
      this.logger.error('Failed to generate PDF', error);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
