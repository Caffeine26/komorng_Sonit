export const TELEGRAM_NOTIFICATION_SERVICE = Symbol('ITelegramNotificationService');

export interface ITelegramNotificationService {
  /**
   * Sends an automated order status update to a customer via Telegram.
   * @param telegramId The customer's Telegram Chat ID
   * @param orderNumber The human-readable order number (e.g. #123)
   * @param status The new status of the order (e.g. PREPARING, READY)
   */
  sendOrderNotification(telegramId: string, orderNumber: string, status: string): Promise<void>;

  /**
   * Sends a direct, manual message to a customer via Telegram.
   * @param telegramId The customer's Telegram Chat ID
   * @param message The raw message text to send
   * @param replyMarkup Optional Telegram ReplyMarkup (e.g. inline keyboard)
   */
  sendDirectMessage(telegramId: string, message: string, replyMarkup?: any): Promise<void>;
}
