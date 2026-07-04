export const AUTH_ONBOARDING_REPOSITORY_PORT = Symbol('AUTH_ONBOARDING_REPOSITORY_PORT');

export interface IAuthOnboardingRepository {
  findInvitationById(id: string): Promise<any | null>;
  findPendingInvitationByChannelIdGlobal(channelId: string): Promise<any | null>;
  findTenantById(id: string): Promise<any | null>;
  findUserByTelegramId(telegramId: string): Promise<any | null>;
  
  registerUserWithProvider(userId: string, fullName: string, email: string | null, avatarUrl: string | null, providerId: string, displayName: string, provider?: string): Promise<void>;
  
  updateUserAndProvider(userId: string, userUpdates: any, providerUpdates: any, provider?: string): Promise<void>;
  
  findUserRole(userId: string, tenantId: string): Promise<any | null>;
  createUserRole(userId: string, tenantId: string, role: string): Promise<void>;
  
  markInvitationAccepted(tenantId: string, inviteId: string): Promise<void>;

  findTelegramProvider(providerId: string): Promise<any | null>;
  findTelegramProviderByUsername(username: string): Promise<any | null>;
  registerBotUserAtomically(userId: string, fullName: string, email: string | null, avatarUrl: string | null, providerId: string, displayName: string): Promise<void>;
  /** Returns the phone number stored for the user linked to the given Telegram chatId (providerId), or null if not found / no phone */
  findUserPhone(telegramChatId: string): Promise<string | null>;
}
