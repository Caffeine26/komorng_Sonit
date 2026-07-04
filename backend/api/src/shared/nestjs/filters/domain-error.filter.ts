import { Catch, ExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../../errors/domain-error';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: DomainError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.httpStatus !== 401) {
      this.logger.warn(`[DomainError] ${exception.code}: ${exception.message}`);
    }

    (response as any).status(exception.httpStatus).json({
      code: exception.code,
      message: exception.message,
    });
  }
}
