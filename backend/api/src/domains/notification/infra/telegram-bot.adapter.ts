import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITelegramNotificationService } from '../core/ports/telegram-notification.service.port';

@Injectable()
export class TelegramBotAdapter implements ITelegramNotificationService {
  private readonly logger = new Logger(TelegramBotAdapter.name);
  private readonly botToken: string;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set. Telegram notifications will fail.');
    }
    this.botToken = token || '';
  }

  async sendOrderNotification(telegramId: string, orderNumber: string, status: string): Promise<void> {
    let message = '';

    if (status === 'PREPARING') {
      message = `ការបញ្ជាទិញរបស់អ្នក #${orderNumber} កំពុងត្រូវបានរៀបចំ 👨‍🍳`;
    } else if (status === 'READY') {
      message = `ការបញ្ជាទិញរបស់អ្នក #${orderNumber} ត្រូវបានរៀបចំរួចរាល់ 🍽️!`;
    } else if (status === 'CANCELLED') {
      message = `ការបញ្ជាទិញរបស់អ្នក #${orderNumber} ត្រូវបានលុបចោល ❌។ សូមទាក់ទងភោជនីយដ្ឋានប្រសិនបើអ្នកមានសំណួរ។`;
    } else {
      // We don't notify on other statuses yet
      return;
    }

    await this.sendMessage(telegramId, message);
  }

  async sendDirectMessage(telegramId: string, message: string, replyMarkup?: any): Promise<void> {
    await this.sendMessage(telegramId, message, replyMarkup, 'HTML');
  }

  private async sendMessage(chatId: string, text: string, replyMarkup?: any, parseMode?: string): Promise<void> {
    if (!this.botToken) {
      this.logger.error(`Cannot send message to ${chatId}: TELEGRAM_BOT_TOKEN missing`);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload: any = {
        chat_id: chatId,
        text: text,
      };

      if (parseMode) {
        payload.parse_mode = parseMode;
      }

      // Only attach reply_markup when there are actual keyboard rows
      const hasInlineKeyboard = replyMarkup?.inline_keyboard?.length > 0;
      const hasReplyKeyboard = replyMarkup?.keyboard?.length > 0;
      if (hasInlineKeyboard || hasReplyKeyboard) {
        payload.reply_markup = replyMarkup;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Failed to send Telegram message to ${chatId}: ${response.status} ${errorData}`);
      } else {
        this.logger.log(`Telegram message sent to ${chatId}`);
      }
    } catch (error: any) {
      this.logger.error(`Error sending Telegram message to ${chatId}: ${error.message}`);
    }
  }
}
