import { z } from 'zod';

export const CreateTableSchema = z.object({
  name: z.string().min(1, "Table name is required"),
  capacity: z.union([z.number(), z.string()]).transform((val) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    return isNaN(parsed) ? 4 : parsed;
  }),
  image: z.string().optional().nullable().or(z.literal('')),
});

export type CreateTableRequest = z.infer<typeof CreateTableSchema>;

export const UpdateTableSchema = z.object({
  name: z.string().min(1, "Table name is required"),
  capacity: z.union([z.number(), z.string()]).transform((val) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    return isNaN(parsed) ? 4 : parsed;
  }),
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']).optional(),
  image: z.string().optional().nullable().or(z.literal('')),
});

export type UpdateTableRequest = z.infer<typeof UpdateTableSchema>;

export const TableResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number(),
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']),
  qrToken: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
});

export type TableResponse = z.infer<typeof TableResponseSchema>;
