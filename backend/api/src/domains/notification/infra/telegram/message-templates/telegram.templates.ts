/**
 * OOP Builder Pattern for Telegram Messages
 * This makes it clean, easy to debug, and ensures consistent formatting (HTML parse mode)
 * across all Telegram notifications.
 */
export class TelegramMessageBuilder {
  private message: string = '';

  constructor(title?: string) {
    if (title) {
      this.message += `${title}\n\n`;
    }
  }

  static create(title?: string): TelegramMessageBuilder {
    return new TelegramMessageBuilder(title);
  }

  addGreeting(name: string): this {
    this.message += `Hello ${name}!\n\n`;
    return this;
  }

  addLine(line: string): this {
    this.message += `${line}\n`;
    return this;
  }

  addBullet(label: string, value: string): this {
    this.message += `• <b>${label}:</b> ${value}\n`;
    return this;
  }

  addSpacing(): this {
    this.message += `\n`;
    return this;
  }

  addCallToAction(text: string): this {
    this.message += `👇 ${text}`;
    return this;
  }

  build(): string {
    return this.message.trim();
  }
}

/**
 * Static Template Factory using the Builder Pattern
 */
export class TelegramNotificationTemplates {
  static buildInviteMessage(restaurantName: string, username: string, roleName: string): string {
    return TelegramMessageBuilder.create(`✉️ <b>Invitation to Join ${restaurantName}</b>`)
      .addGreeting(`@${username}`)
      .addLine(`You have been invited to join our restaurant team:`)
      .addSpacing()
      .addBullet('Role', roleName)
      .addBullet('Portal', 'Komorng Admin Panel')
      .addSpacing()
      .addCallToAction(`Tap the button below to accept your invitation and access your storefront dashboard:`)
      .build();
  }

  static buildWelcomeMessage(restaurantName: string, roleName: string): string {
    return TelegramMessageBuilder.create(`🎉 <b>Welcome to ${restaurantName}!</b>`)
      .addLine(`You have been invited to join the team as a <b>${roleName}</b>.`)
      .addSpacing()
      .addCallToAction(`Tap the button below to accept your invitation and access your store dashboard instantly:`)
      .build();
  }

  static buildAcceptanceConfirmationMessage(restaurantName: string, firstName: string, roleName: string): string {
    return TelegramMessageBuilder.create(`<b>🎉Welcome to the Team!</b>`)
      .addGreeting(firstName || 'there')
      .addLine(`You have successfully accepted the invitation and logged in.`)
      .addSpacing()
      .addBullet('Restaurant', restaurantName)
      .addBullet('Role', roleName)
      .addSpacing()
      .addLine(`Your staff account is now fully active! You can view and manage restaurant orders, catalog items, and tables directly from your admin panel.`)
      .build();
  }

  static buildDefaultWelcomeMessage(fullName: string, username: string): string {
    return TelegramMessageBuilder.create(`👋 <b>Hello ${fullName || `@${username}`}!</b>`)
      .addLine(`Welcome to the <b>Komorng Staff Bot</b>.`)
      .addSpacing()
      .addLine(`This bot delivers instant order alerts and team notifications. To get started, please request a team invitation link from your store manager!`)
      .build();
  }
}
