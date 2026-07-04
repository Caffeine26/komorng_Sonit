'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}


interface Props {
  botName: string;
  botId?: string; // numeric bot ID — enables Safari popup fallback
  onAuth: (user: TelegramUser) => void;
  className?: string;
  buttonText?: string;
  onClick?: () => void; // Notify when interaction starts
}

export function TelegramLoginButton({ botName, botId, onAuth, className, buttonText, onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Define global callback
    (window as any).onTelegramAuth = (user: TelegramUser) => {
      onAuth(user);
    };

    if (containerRef.current) {
      // 2. Create the required button element for the new library
      containerRef.current.innerHTML = `
        <button class="tg-auth-button" data-style="shine">${buttonText || 'Sign In with Telegram'}</button>
      `;

      // 3. Create the New Widget Script (OAuth 2.0 Library)
      const script = document.createElement('script');
      script.src = 'https://oauth.telegram.org/js/telegram-login.js?5';
      script.setAttribute('data-client-id', botId || '');
      script.setAttribute('data-onauth', 'onTelegramAuth(data)');
      script.setAttribute('data-request-access', 'write phone');
      script.async = true;

      containerRef.current.appendChild(script);
    }

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botId, onAuth, buttonText]);

  return (
    <div className={cn("flex flex-col items-center justify-center w-full min-h-[50px]", className)}>
      {/* The Official Telegram Widget */}
      <div ref={containerRef} className="w-full flex justify-center" />
    </div>
  );
}
