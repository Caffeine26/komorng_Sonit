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

    // 2. Create Widget Script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '15');
    script.setAttribute('data-userpic', 'true'); // Show profile picture
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    // 3. Append to container
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botName, onAuth]);

  return (
    <div className={cn("flex flex-col items-center justify-center w-full min-h-[50px]", className)}>
      {/* The Official Telegram Widget */}
      <div ref={containerRef} className="w-full flex justify-center" />
    </div>
  );
}
