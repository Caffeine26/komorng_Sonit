import { z } from 'zod';
import { BillStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '@xfos/contracts-enums';

export const BillSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  totalCents: z.number().int().nonnegative(),
  status: BillStatusEnum,
});
export type Bill = z.infer<typeof BillSchema>;

export const PayBillSchema = z.object({
  method: PaymentMethodEnum,
});
export type PayBillInput = z.infer<typeof PayBillSchema>;

export const PaymentStatusResponseSchema = z.object({
  billId: z.string(),
  status: PaymentStatusEnum,
});
export type PaymentStatusResponse = z.infer<typeof PaymentStatusResponseSchema>;
