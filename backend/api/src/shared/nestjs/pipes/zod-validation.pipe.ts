import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Generic Zod validation pipe. Use in controllers as:
 *   @Body(new ZodValidationPipe(SubmitOrderSchema)) dto: SubmitOrderInput
 * The schema comes from `contracts/*` — single source of truth with the frontend.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
