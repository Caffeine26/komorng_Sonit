'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TelegramLoginButton } from '@/features/auth/components/TelegramLoginButton';
import { FacebookLoginButton } from '@/features/auth/components/FacebookLoginButton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { config } from '@/config';
import { useTranslations } from 'next-intl';

/**
 * LoginPage - Social Only Layout (Telegram Only)
 * [Squad Protocol] Google is kept as a static UI element per user request.
 */
export default function LoginPage() {
    const params = useParams();
    const router = useRouter();
    const { handleTelegramAuth, handleFacebookAuth, handleFacebookRegister, handleSendTelegramOtp, handleLinkFacebook, handleLinkFacebookOAuth, cancelSocialLogin, isLoading, error, setError, user, isAccountNotFound } = useAuth();

    // Phase 3 UI States
    const [linkingStep, setLinkingStep] = useState<'decision' | 'enter_username' | 'enter_otp'>('decision');
    const [telegramUsername, setTelegramUsername] = useState('');
    const [otp, setOtp] = useState('');
    
    const t = useTranslations('auth');

    console.log('[LoginPage] isAccountNotFound:', isAccountNotFound);
    console.log('[LoginPage] User:', user);

    // AUTO-REDIRECT: If we already know who this is, skip the login page!
    useEffect(() => {
        console.log('[LoginPage] Auto-redirect check. User:', user, 'isAccountNotFound:', isAccountNotFound);
        if (user?.tenantId && user?.tenantSlug) {
            console.log('[LoginPage] Redirecting to dashboard...');
            router.push(`/${user.tenantSlug}`);
        }
    }, [user, router, isAccountNotFound]);

    const BOT_NAME = config.telegramBotName;

    return (
        <div className="min-h-screen w-full bg-[#F3F4F6] flex items-center justify-center p-4 md:p-10 font-sans">

            {/* Premium Social Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/20 backdrop-blur-xl animate-in fade-in duration-500">
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-[var(--color-brand)]/10 border-t-[var(--color-brand)] rounded-full animate-spin" />
                            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-[var(--color-brand)]/30 rounded-full animate-pulse" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-xl font-bold text-[var(--color-foreground)] tracking-tight">{t('securing_connection')}</p>
                            <p className="text-sm font-medium text-[var(--color-muted)] animate-pulse">{t('communicating_telegram')}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Glass Card */}
            <div className="w-full max-w-[1100px] bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] flex flex-col md:flex-row overflow-hidden min-h-[700px]">

                {/* Left Pane: Artistic Image */}
                <div className="hidden md:flex md:w-1/2 p-4">
                    <div className="w-full h-full rounded-[32px] overflow-hidden relative">
                        <img
                            src="/shared/images/login.png"
                            alt="Artistic 3D Sculpture"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-[var(--color-brand)]/5 mix-blend-overlay" />
                    </div>
                </div>

                {/* Right Pane: Social Login */}
                <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center">
                    <div className="w-full max-w-[400px] mx-auto text-center md:text-left">

                        {/* Logo & Header */}
                        <div className="mb-12">
                            <div className="flex items-center justify-center md:justify-start gap-2 mb-6">
                                <div className="w-10 h-10 rounded-xl overflow-hidden">
                                    <img src="/shared/images/girllogo.png" alt="Komorng Logo" className="w-full h-full object-cover" />
                                </div>
                                <span className="text-2xl font-black tracking-tighter text-[var(--color-foreground)]">Komorng</span>
                            </div>
                            <h1 className="text-4xl font-bold text-[var(--color-foreground)] mb-3 tracking-tight leading-tight">{t('login_title')}</h1>
                            <p className="text-[var(--color-muted)] font-medium">{t('login_desc')}</p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm font-medium animate-in fade-in slide-in-from-top-1 text-center">
                                {error}
                            </div>
                        )}

                        {/* Social Buttons Stack or Decision UI */}
                        <div className="space-y-4 w-full">
                            {isAccountNotFound ? (
                                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl mb-2">
                                        <p className="text-orange-800 text-sm font-medium text-center">
                                            {t('no_account_linked')}
                                        </p>
                                    </div>

                                    {linkingStep === 'decision' && (
                                        <>
                                            <button
                                                onClick={handleFacebookRegister}
                                                disabled={isLoading}
                                                className="w-full flex items-center justify-center gap-2 bg-[var(--color-brand)] text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-[var(--color-brand)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                            >
                                                {t('create_new_account')}
                                            </button>
                                            <div className="w-full relative py-2 flex items-center justify-center">
                                                <div className="border-t border-zinc-200 w-full absolute"></div>
                                                <span className="bg-white px-2 relative text-xs text-zinc-400 font-bold uppercase tracking-wider">{t('or')}</span>
                                            </div>

                                            <div className="flex flex-col items-center justify-center w-full gap-2 mt-4">
                                                <button
                                                    onClick={() => { setLinkingStep('enter_username'); setError(null); }}
                                                    className="w-full flex items-center justify-center gap-2 bg-[#229ED9] text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-[#229ED9]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    {t('link_telegram')}
                                                </button>
                                            </div>
                                            <button
                                                onClick={cancelSocialLogin}
                                                disabled={isLoading}
                                                className="text-sm text-zinc-500 hover:text-zinc-800 font-medium mt-2"
                                            >
                                                {t('cancel')}
                                            </button>
                                        </>
                                    )}

                                    {linkingStep === 'enter_username' && (
                                        <div className="flex flex-col gap-3 animate-in fade-in">
                                            <p className="text-sm font-medium text-zinc-600 text-center mb-2">
                                                {t('enter_username')}
                                            </p>
                                            <input
                                                type="text"
                                                placeholder={t('username_placeholder')}
                                                value={telegramUsername}
                                                onChange={(e) => setTelegramUsername(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)] transition-all"
                                            />
                                            <button
                                                onClick={async () => {
                                                    if (!telegramUsername) return;
                                                    const success = await handleSendTelegramOtp(telegramUsername);
                                                    if (success) {
                                                        setLinkingStep('enter_otp');
                                                        setError(null);
                                                    }
                                                }}
                                                disabled={!telegramUsername || isLoading}
                                                className="w-full flex items-center justify-center bg-[var(--color-brand)] text-white px-6 py-4 rounded-xl font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 mt-2"
                                            >
                                                Send Code via Telegram
                                            </button>
                                            <button
                                                onClick={() => { setLinkingStep('decision'); setError(null); }}
                                                className="text-sm text-zinc-500 hover:text-zinc-800 font-medium mt-2"
                                            >
                                                Back
                                            </button>
                                        </div>
                                    )}

                                    {linkingStep === 'enter_otp' && (
                                        <div className="flex flex-col gap-3 animate-in fade-in">
                                            <p className="text-sm font-medium text-zinc-600 text-center mb-2">
                                                We sent a 6-digit code to your Telegram.
                                            </p>
                                            <input
                                                type="text"
                                                placeholder="123456"
                                                maxLength={6}
                                                value={otp}
                                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)] transition-all text-center tracking-widest text-xl font-bold"
                                            />
                                            <button
                                                onClick={() => handleLinkFacebook(telegramUsername, otp)}
                                                disabled={otp.length !== 6 || isLoading}
                                                className="w-full flex items-center justify-center bg-[var(--color-brand)] text-white px-6 py-4 rounded-xl font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 mt-2"
                                            >
                                                Verify & Link Account
                                            </button>
                                            <button
                                                onClick={() => { setLinkingStep('enter_username'); setOtp(''); setError(null); }}
                                                className="text-sm text-zinc-500 hover:text-zinc-800 font-medium mt-2"
                                            >
                                                Change Username
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Telegram Widget (Active) */}
                                    <div className="flex justify-center">
                                        <TelegramLoginButton
                                            botName={BOT_NAME}
                                            botId={config.telegramBotId}
                                            onAuth={handleTelegramAuth}
                                            buttonText="Login with Telegram"
                                            className="w-full flex justify-center transform scale-105"
                                        />
                                    </div>

                                    <div className="relative py-4 flex items-center gap-4">
                                        <div className="flex-1 border-t border-zinc-100"></div>
                                        <span className="text-xs font-bold text-zinc-300 tracking-widest">{t('or').toLowerCase()}</span>
                                        <div className="flex-1 border-t border-zinc-100"></div>
                                    </div>

                                    <div className="flex justify-center">
                                        <FacebookLoginButton
                                            onAuth={handleFacebookAuth}
                                            buttonText={t('continue_facebook')}
                                            className="w-full flex justify-center transform scale-105"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <p className="text-center text-[var(--color-muted)] text-sm font-medium mt-12 pt-8 border-t border-zinc-50">
                            {t('new_here')} <Link href={`/auth/signup`} className="text-[var(--color-brand)] font-bold hover:underline">{t('create_merchant')}</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
