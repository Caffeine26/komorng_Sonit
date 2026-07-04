export const NOTIFICATION_REPOSITORY_PORT = Symbol('INotificationRepository');

export interface INotificationRepository {
  /**
   * Retrieves the Telegram ID for a given user.
   * @param userId The User ID (which corresponds to customerId in the order context)
   * @returns The Telegram ID string if linked, otherwise null.
   */
  getTelegramIdByUserId(userId: string): Promise<string | null>;
}
