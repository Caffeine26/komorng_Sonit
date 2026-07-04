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
  const [showRescueButton, setShowRescueButton] = useState(false);
  const [isWidgetLoaded, setIsWidgetLoaded] = useState(false);

  // Safari fallback: open Telegram OAuth popup and listen for postMessage
  const handleRescueClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!botId) return; // no botId — let the default href open t.me as before
    e.preventDefault();
    const origin = window.location.origin;
    const authUrl =
      `https://oauth.telegram.org/auth` +
      `?bot_id=${encodeURIComponent(botId)}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&request_access=write` +
      `&embed=1`;
    const popup = window.open(authUrl, 'TelegramLogin', 'width=550,height=470,resizable=yes,scrollbars=yes,status=yes');
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://oauth.telegram.org') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'auth_result' && data?.result) {
          window.removeEventListener('message', handleMessage);
          popup?.close();
          onAuth(data.result);
        }
      } catch (err) {
        console.error('[TelegramAuth] popup message parse error:', err);
      }
    };
    window.addEventListener('message', handleMessage);
  };

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
      containerRef.current.innerHTML = ''; // Clear any previous attempts
      containerRef.current.appendChild(script);
    }

    // 4. SAFARI/AD-BLOCKER PROTECTION:
    // If the widget hasn't loaded an iframe within 4 seconds, show the rescue button.
    const timer = setTimeout(() => {
      if (containerRef.current && !containerRef.current.querySelector('iframe')) {
        console.warn('[TelegramWidget] Blocked or Slow. Showing Rescue Button.');
        setShowRescueButton(true);
      }
    }, 4000);

    return () => {
      clearTimeout(timer);
      delete (window as any).onTelegramAuth;
    };
  }, [botName, onAuth]);

  return (
    <div className={cn("flex flex-col items-center justify-center w-full min-h-[50px]", className)}>
      {/* The Official Telegram Widget (Injected here) */}
      <div ref={containerRef} className={cn("w-full flex justify-center", showRescueButton && "hidden")} />

      {/* The High-Quality Rescue Button (Visible only if widget fails) */}
      {showRescueButton && (
        <div className="animate-in fade-in zoom-in duration-700 flex flex-col items-center gap-3">
          <a
            href={botId ? undefined : `https://t.me/${botName}`}
            target={botId ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={handleRescueClick}
            className="flex items-center gap-3 px-8 py-3.5 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-2xl transition-all shadow-xl active:scale-[0.97] border border-white/10 group"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="group-hover:rotate-12 transition-transform">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.36-.49.99-.75 3.88-1.69 6.46-2.8 7.75-3.33 3.69-1.51 4.45-1.77 4.95-1.78.11 0 .36.03.52.16.13.1.17.23.18.33.01.12.01.25 0 .38z" />
            </svg>
            <span className="font-bold text-base">{buttonText || "Signup with Telegram"}</span>
          </a>
          <p className="text-[10px]tracking-widest text-zinc-400 font-bold">
            Safari Protection Active
          </p>
        </div>
      )}
    </div>
  );
}
