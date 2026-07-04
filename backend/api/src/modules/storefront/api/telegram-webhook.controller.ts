import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../../shared/guards/public.decorator';
import { UpdatePhoneFromTelegramUseCase } from '../../../domains/auth/application/use-cases/update-phone-from-telegram.use-case';

@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly updatePhoneUseCase: UpdatePhoneFromTelegramUseCase,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any, @Req() req: Request) {
    // Basic verification - typically you'd check a secret token in the URL or headers
    // Telegram sends a secret token in headers: 'X-Telegram-Bot-Api-Secret-Token'
    
    // Check if it's a message containing contact info
    if (body.message && body.message.contact) {
      const contact = body.message.contact;
      const telegramId = contact.user_id?.toString() || body.message.from?.id?.toString();
      const phoneNumber = contact.phone_number;

      if (telegramId && phoneNumber) {
        try {
          await this.updatePhoneUseCase.execute(telegramId, phoneNumber);
          console.log(`Updated phone number for Telegram User ${telegramId} to ${phoneNumber}`);
        } catch (error) {
          console.error(`Failed to update phone from Telegram webhook for user ${telegramId}`, error);
        }
      }
    }

    // Always return 200 OK to Telegram so it doesn't retry
    return { success: true };
  }
}
