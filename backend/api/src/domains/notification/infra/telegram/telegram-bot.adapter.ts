import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../../auth/core/ports/auth-onboarding.repository.port';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { TelegramNotificationTemplates } from './message-templates';

import { GetOrderPdfUseCase } from '../../../order/application/use-cases/get-order-pdf.use-case';
import { UpdatePhoneFromTelegramUseCase } from '../../../auth/application/use-cases/update-phone-from-telegram.use-case';
import { LinkTelegramGuestToOrderUseCase } from '../../../order/application/use-cases/link-telegram-guest-to-order.use-case';
import { MarkNotificationClickedUseCase } from '../../../notification/application/use-cases/mark-notification-clicked.use-case';
import { ITelegramNotificationService } from '../../../notification/core/ports/telegram-notification.service.port';

@Injectable()
export class TelegramBotAdapter implements OnModuleInit, OnModuleDestroy, ITelegramNotificationService {
  private readonly logger = new Logger(TelegramBotAdapter.name);
  private isPolling = false;
  private offset = 0;
  private pollTimeout: NodeJS.Timeout | null = null;
  private readonly botToken: string;

  constructor(
    @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
    private readonly authOnboardingRepository: IAuthOnboardingRepository,
    private readonly config: ConfigService,
    private readonly getOrderPdfUseCase: GetOrderPdfUseCase,
    private readonly updatePhoneFromTelegramUseCase: UpdatePhoneFromTelegramUseCase,
    private readonly linkTelegramGuestToOrderUseCase: LinkTelegramGuestToOrderUseCase,
    private readonly markNotificationClickedUseCase: MarkNotificationClickedUseCase,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set. Telegram notifications will fail.');
    }
    this.botToken = token || '';
  }

  onModuleInit() {
    if (!this.botToken) {
      this.logger.warn('[TelegramBot] TELEGRAM_BOT_TOKEN is not configured. Polling disabled.');
      return;
    }
    this.logger.log('[TelegramBot] Initializing bot polling...');
    this.isPolling = true;
    this.startPolling();
  }

  onModuleDestroy() {
    this.isPolling = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
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
      return;
    }

    await this.sendMessage(telegramId, message);
  }

  async sendDirectMessage(telegramId: string, message: string, replyMarkup?: any): Promise<void> {
    await this.sendMessage(telegramId, message, replyMarkup, 'HTML');
  }

  private async startPolling() {
    const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';
    while (this.isPolling) {
      try {
        const response = await fetch(
          `${telegramApiUrl}/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=30`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error(`Telegram API responded with HTTP status ${response.status}`);
        }

        const data = (await response.json()) as any;
        if (data && data.ok && data.result && data.result.length > 0) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (err: any) {
        this.logger.error(`[TelegramBot] Polling error: ${err?.message}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleUpdate(update: any) {
    if (update.callback_query) {
      return this.handleCallbackQuery(update.callback_query);
    }

    const message = update.message;
    if (!message) return;

    const chatId = message.chat.id.toString();

    // 1. Handle Contact Sharing
    if (message.contact) {
      const contact = message.contact;
      const telegramId = contact.user_id?.toString() || message.from?.id?.toString();
      let phoneNumber = contact.phone_number;

      // Format Cambodian numbers from +855 or 855 to a local 0 prefix
      if (phoneNumber.startsWith('+855')) {
        phoneNumber = '0' + phoneNumber.slice(4);
      } else if (phoneNumber.startsWith('855')) {
        phoneNumber = '0' + phoneNumber.slice(3);
      }

      if (telegramId && phoneNumber) {
        try {
          try {
            await this.updatePhoneFromTelegramUseCase.execute(telegramId, phoneNumber);
            this.logger.log(`[TelegramBot] Updated phone number for telegram user ${telegramId} to ${phoneNumber}`);
            await this.sendMessage(chatId, `✅ Thank you! Your phone number ${phoneNumber} has been securely saved.`);
          } catch (err: any) {
            if (err.status !== 404) {
              this.logger.error(`[TelegramBot] Failed to update phone number: ${err?.message}`);
            }
          }
        } catch (err: any) {
          this.logger.error(`[TelegramBot] Failed to update phone number: ${err?.message}`);
        }
      }
      return;
    }

    // 2. Ignore non-text messages after contact check
    if (!message.text) return;

    const text = message.text.trim();
    const username = message.from.username || '';
    const firstName = message.from.first_name || '';
    const lastName = message.from.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    this.logger.log(`[TelegramBot] Received message from @${username} (chatId: ${chatId}): "${text}"`);

    // Proactively register/upsert bot-user mapping so we can DM them subsequent invitations!
    await this.registerBotUser(chatId, username, fullName);

    // Check if the message is a /start command
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const startParam = parts[1] || '';

      if (startParam.startsWith('inv_')) {
        const inviteId = startParam.replace('inv_', '');
        await this.handleInvitationStart(chatId, username, fullName, inviteId);
      } else if (startParam.startsWith('guest_')) {
        const orderToken = startParam.replace('guest_', '');
        await this.handleGuestStart(chatId, username, fullName, orderToken);
      } else {
        // Fallback: If no deep link start parameter is passed, scan DB for active invitations matching their username
        if (username) {
          const pendingInvite = await this.authOnboardingRepository.findPendingInvitationByChannelIdGlobal(username);

          if (pendingInvite) {
            this.logger.log(`[TelegramBot] Found pending invitation fallback for @${username} (id: ${pendingInvite.id})`);
            await this.handleInvitationStart(chatId, username, fullName, pendingInvite.id);
            return;
          }
        }
        await this.sendDefaultWelcome(chatId, username, fullName);
      }
    }
  }

  private async handleGuestStart(
    chatId: string,
    username: string,
    fullName: string,
    orderToken: string,
  ) {
    const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';

    try {
      // 1. Link order to guest using the Use Case
      const order = await this.linkTelegramGuestToOrderUseCase.execute(
        orderToken,
        chatId,
        username,
        fullName,
        await this.fetchTelegramAvatar(chatId)
      );

      // 4. Send the nice Order Submitted message with Inline Button (mimicking normal customer flow)
      const storefrontBaseUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || 'http://localhost:3000';
      const receiptUrl = `${storefrontBaseUrl}/o/${order.orderToken}?telegram=true`;

      const itemsList = order.items.map((item: any) => {
        const nameParts = (item.itemName || '').split(' / ');
        const nameKm = nameParts[0] || item.itemName;
        return `• ${item.quantity}x ${nameKm}`;
      }).join('\n');
      const orderMsg = `🛒 <b>ការបញ្ជាទិញរបស់លោកអ្នកទទួលបានជោគជ័យ</b>\n\nលេខការបញ្ជាទិញ: #${order.orderNumber}\n\n<b>មុខទំនិញ:</b>\n${itemsList}\n\n<i>អ្នកនឹងទទួលបានវិក្កយបត្រឌីជីថលនៅពេលរួចរាល់!</i> 🧾`;

      await fetch(`${telegramApiUrl}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: orderMsg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🧾 មើលវិក្កយបត្រ", url: receiptUrl },
                { text: "⬇️ រក្សាទុកជា PDF", callback_data: `send_pdf:${order.orderToken}` }
              ]
            ]
          }
        })
      });

      // 5. Check if the user already has a phone number saved.
      //    If they do, skip the share-phone prompt — they already registered.
      const userAlreadyHasPhone = !!(order as any).userPhone;
      // Fallback: check via the userId linked on the order
      let hasPhone = userAlreadyHasPhone;
      if (!hasPhone && order.userId) {
        const provider = await this.authOnboardingRepository.findTelegramProvider(chatId);
        // We can't easily get user.phone here without a user repo injection,
        // so we use a heuristic: if TenantCustomer already existed before this call,
        // the user may already have a phone. We'll check by looking at the linked user's provider.
        // The simplest reliable signal: if this order was ALREADY linked to userId before this call
        // (i.e. order.userId was already set), the customer is returning → check if phone exists.
        // We inject a simple DB check via the authOnboardingRepository.
        hasPhone = !!(await this.authOnboardingRepository.findUserPhone(chatId));
      }

      if (!hasPhone) {
        // 5a. First time customer — ask them to share phone number
        const welcomeText = `សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកនៅទីនេះ ដើម្បីទទួលបានវិក្កយបត្រ និងព័ត៌មានថ្មីៗ!`;

        const res = await fetch(`${telegramApiUrl}/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: welcomeText,
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [
                [{ text: '📱 ចែករំលែកលេខទូរស័ព្ទ', request_contact: true }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }),
        });

        if (!res.ok) {
          this.logger.error(`[TelegramBot] Send guest welcome error: ${JSON.stringify(await res.json())}`);
        }
      } else {
        // 5b. Returning customer with phone already on file — just send a dismissal keyboard
        await fetch(`${telegramApiUrl}/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ អ្នកបានចុះឈ្មោះជាសមាជិករួចហើយ!`,
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true }
          }),
        });
      }
    } catch (err: any) {
      this.logger.error(`[TelegramBot] Failed to handle guest start: ${err?.message}`);
    }
  }

  private async fetchTelegramAvatar(chatId: string): Promise<string | null> {
    if (!this.botToken) return null;

    try {
      const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';
      const response = await fetch(
        `${telegramApiUrl}/bot${this.botToken}/getUserProfilePhotos?user_id=${chatId}&limit=1`
      );
      if (!response.ok) return null;

      const data = (await response.json()) as any;
      if (data && data.ok && data.result && data.result.total_count > 0) {
        const photos = data.result.photos[0];
        const largestPhoto = photos[photos.length - 1];
        const fileId = largestPhoto.file_id;

        const fileResponse = await fetch(
          `${telegramApiUrl}/bot${this.botToken}/getFile?file_id=${fileId}`
        );
        if (!fileResponse.ok) return null;

        const fileData = (await fileResponse.json()) as any;
        if (fileData && fileData.ok && fileData.result) {
          const filePath = fileData.result.file_path;
          return `${telegramApiUrl}/file/bot${this.botToken}/${filePath}`;
        }
      }
    } catch (err: any) {
      this.logger.error(`[TelegramBot] Failed to fetch Telegram avatar: ${err?.message}`);
    }
    return null;
  }

  private async handleInvitationStart(
    chatId: string,
    username: string,
    fullName: string,
    inviteId: string,
  ) {
    const adminUrl = this.config.get<string>('ADMIN_APP_URL') || this.config.get<string>('NEXT_PUBLIC_ADMIN_URL') || 'http://localhost:3002';

    try {
      // 1. Fetch invitation
      const invitation = await this.authOnboardingRepository.findInvitationById(inviteId);

      if (!invitation) {
        await this.sendMessage(
          chatId,
          `⚠️ <b>Invalid Invitation</b>\n\nThis invitation link seems to be invalid or no longer exists. Please contact your store manager for a new link.`,
        );
        return;
      }

      if (invitation.status !== 'PENDING') {
        await this.sendMessage(
          chatId,
          `⚠️ <b>Invitation Accepted</b>\n\nThis invitation has already been accepted or revoked.`,
        );
        return;
      }

      if (invitation.expiresAt < new Date()) {
        await this.sendMessage(
          chatId,
          `⚠️ <b>Expired Invitation</b>\n\nThis invitation has expired. Please request a new invitation from your store manager.`,
        );
        return;
      }

      // Fetch tenant separately to get restaurant details
      const tenant = await this.authOnboardingRepository.findTenantById(invitation.tenantId);

      // 2. Find if UserAuthProvider already exists for this Telegram ID
      let provider = await this.authOnboardingRepository.findTelegramProvider(chatId);

      if (!provider) {
        // Find if user already exists with matching username in provider
        provider = await this.authOnboardingRepository.findTelegramProviderByUsername(username);
      }

      // If user starts the bot via invitation link, save/track their Telegram provider mapping instantly
      if (!provider) {
        const userId = randomUUID();
        const avatarUrl = await this.fetchTelegramAvatar(chatId);
        await this.authOnboardingRepository.registerBotUserAtomically(
          userId, fullName || 'Telegram User', invitation.email || null, avatarUrl, chatId, username || fullName
        );
        this.logger.log(`[TelegramBot] Atomically registered user ${userId} (@${username}) via start parameter with avatar`);
      } else {
        // If provider exists but displayName/username has changed, update it
        const avatarUrl = await this.fetchTelegramAvatar(chatId);
        const updates: any = {};
        if (provider.displayName !== username) {
          updates.displayName = username;
        }
        if (avatarUrl) {
          updates.avatarUrl = avatarUrl;
        }

        const userUpdates: any = {};
        if (fullName) userUpdates.fullName = fullName;
        if (avatarUrl) userUpdates.avatarUrl = avatarUrl;

        await this.authOnboardingRepository.updateUserAndProvider(provider.userId, userUpdates, updates);
      }

      const restaurantName = tenant?.nameEn || 'our restaurant';
      const roleLabels: Record<string, string> = {
        TENANT_MANAGER: 'Manager',
        SERVICE_STAFF: 'Service Staff',
        KITCHEN_STAFF: 'Kitchen Staff',
      };
      const roleName = roleLabels[invitation.role] || invitation.role;

      const acceptInviteLink = `${adminUrl}/auth/login?inviteId=${invitation.id}`;

      const welcomeText = TelegramNotificationTemplates.buildWelcomeMessage(restaurantName, roleName);

      const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';
      const res = await fetch(`${telegramApiUrl}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ Accept & Access Dashboard',
                  url: acceptInviteLink,
                }
              ]
            ]
          }
        }),
      });

      if (!res.ok) {
        const errData = await res.json() as any;
        this.logger.error(`[TelegramBot] Send invitation returned error: ${JSON.stringify(errData)}`);
      } else {
        this.logger.log(`[TelegramBot] Successfully sent welcome card to @${username} (chatId: ${chatId})`);
      }

    } catch (err: any) {
      this.logger.error(`[TelegramBot] Failed to handle invitation start: ${err?.message}`);
    }
  }

  private async registerBotUser(chatId: string, username: string, fullName: string) {
    if (!username) return;

    try {
      // 1. Search for existing Telegram provider by chatId
      let provider = await this.authOnboardingRepository.findTelegramProvider(chatId);

      if (!provider) {
        // Search by username fallback
        provider = await this.authOnboardingRepository.findTelegramProviderByUsername(username);
      }

      // 2. If not exists, dynamically create a pending guest user mapping
      if (!provider) {
        const userId = randomUUID();
        const avatarUrl = await this.fetchTelegramAvatar(chatId);
        await this.authOnboardingRepository.registerBotUserAtomically(
          userId, fullName || 'Telegram User', null, avatarUrl, chatId, username
        );
        this.logger.log(`[TelegramBot] Automatically registered mapping for @${username} (chatId: ${chatId})`);
      } else {
        // 3. If exists, update chat ID, username or avatar if changed
        const avatarUrl = await this.fetchTelegramAvatar(chatId);
        const updates: any = {};
        let needsUpdate = false;

        if (provider.providerId !== chatId) {
          updates.providerId = chatId;
          needsUpdate = true;
        }
        if (provider.displayName !== username) {
          updates.displayName = username;
          needsUpdate = true;
        }
        if (avatarUrl && provider.avatarUrl !== avatarUrl) {
          updates.avatarUrl = avatarUrl;
          needsUpdate = true;
        }

        const userUpdates: any = {};
        if (fullName) userUpdates.fullName = fullName;
        if (avatarUrl) userUpdates.avatarUrl = avatarUrl;

        if (needsUpdate || Object.keys(userUpdates).length > 0) {
          await this.authOnboardingRepository.updateUserAndProvider(provider.userId, userUpdates, updates);
        }
      }
    } catch (err: any) {
      this.logger.error(`[TelegramBot] Failed to register/update bot user mapping: ${err?.message}`);
    }
  }

  private async sendDefaultWelcome(chatId: string, username: string, fullName: string) {
    const welcomeText = TelegramNotificationTemplates.buildDefaultWelcomeMessage(fullName, username);
    await this.sendMessage(chatId, welcomeText);
  }

  public async sendMessage(chatId: string, text: string, replyMarkup?: any, parseMode?: string) {
    if (!this.botToken) {
      this.logger.error(`Cannot send message to ${chatId}: TELEGRAM_BOT_TOKEN missing`);
      return;
    }
    const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: parseMode || 'HTML',
      };

      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const res = await fetch(`${telegramApiUrl}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json() as any;
        this.logger.error(`[TelegramBot] sendMessage returned error: ${JSON.stringify(errData)}`);
      }
    } catch (err: any) {
      this.logger.error(`[TelegramBot] Failed to send message: ${err?.message}`);
    }
  }

  private async handleCallbackQuery(callbackQuery: any) {
    const data = callbackQuery.data;
    const message = callbackQuery.message;
    const callbackQueryId = callbackQuery.id;

    if (!data || !message) return;

    const telegramApiUrl = this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org';

    if (data.startsWith('promo_click:')) {
      const notificationId = data.replace('promo_click:', '');

      try {
        // 1. Mark notification as clicked in DB using the Use Case
        const notification = await this.markNotificationClickedUseCase.execute(notificationId);

        // 2. Change the inline button text to "Accepted ✅"
        await fetch(`${telegramApiUrl}/bot${this.botToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            message_id: message.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Accepted ✅',
                    callback_data: 'promo_already_accepted', // Prevent further action
                  }
                ]
              ]
            }
          }),
        });

        // 3. Answer the callback query to stop the loading spinner (no alert)
        const promoCode = notification.actionUrl || 'Promo Applied!';
        await fetch(`${telegramApiUrl}/bot${this.botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
          }),
        });

        // 4. Send a new permanent message with the promo code so they can show the merchant
        await this.sendMessage(
          message.chat.id.toString(),
          `Here is your promo code to show to the merchant:\n\n<b>${promoCode}</b>`
        );

      } catch (err: any) {
        this.logger.error(`[TelegramBot] Failed to handle promo click callback: ${err?.message}`);
      }
    } else if (data === 'promo_already_accepted') {
      await fetch(`${telegramApiUrl}/bot${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: 'You have already accepted this promo code.',
          show_alert: false,
        }),
      });
    } else if (data.startsWith('send_pdf:')) {
      const orderToken = data.replace('send_pdf:', '');
      const chatId = message.chat.id.toString();

      // 1. Answer callback quickly to stop loading spinner
      await fetch(`${telegramApiUrl}/bot${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
      });

      try {
        // 2. Generate PDF
        const { buffer: pdfBuffer, orderNumber } = await this.getOrderPdfUseCase.execute(orderToken, 'km');

        // 3. Send Document to Telegram
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('document', new Blob([pdfBuffer], { type: 'application/pdf' }), `receipt_${orderNumber}.pdf`);

        const res = await fetch(`${telegramApiUrl}/bot${this.botToken}/sendDocument`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          this.logger.error(`[TelegramBot] sendDocument error: ${JSON.stringify(await res.json())}`);
        }
      } catch (err: any) {
        this.logger.error(`[TelegramBot] Failed to generate/send PDF: ${err?.message}`);
        await this.sendMessage(chatId, `⚠️ Sorry, we couldn't generate the PDF receipt right now.`);
      }
    }
  }
}
