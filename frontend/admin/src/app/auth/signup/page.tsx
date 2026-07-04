'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  Store,
  Globe,
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronLeft,
  X,
  Loader2,
  Mail
} from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { TelegramLoginButton } from '@/features/auth/components/TelegramLoginButton';
import { config } from '@/config';
import { useTranslations } from 'next-intl';

/**
 * SignupPage - Split Pane Layout
 * [Squad Protocol] Multi-step onboarding with high-fidelity 3D artwork.
 */
export default function SignupPage() {
  const params = useParams();
  const { handleRegisterTenant, handleTelegramSignup, handleFacebookAuth, isLoading: isSubmitting, error } = useAuth();
  const router = useRouter();
  const t = useTranslations('auth');
  const [step, setStep] = useState(0); // Start at Step 0 (Identity)
  const [isAuthed, setIsAuthed] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    storeNameEn: '',
    storeNameKm: '',
    slug: '',
    category: 'STALL_KIOSK',
    description: '',
    document: null as File | null,
  });

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleTelegramSuccess = async (user: any) => {
    const success = await handleTelegramSignup(user);
    if (success) {
      setIsAuthed(true);
      setStep(1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleRegisterTenant(formData);
    if (success) setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen w-full bg-[#F3F4F6] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-[500px] z-10 text-center">
          <div className="bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-12 relative overflow-hidden">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
              <CheckCircle2 className="w-10 h-10 text-green-500 animate-in zoom-in duration-500" />
            </div>

            <h1 className="text-3xl font-bold text-[var(--color-foreground)] mb-4 tracking-tight">{t('application_received')}</h1>
            <p className="text-[var(--color-muted)] leading-relaxed mb-10">
              {t('application_desc1')} <span className="font-bold text-[var(--color-foreground)]">{formData.storeNameKm || formData.storeNameEn}</span> {t('application_desc2')}
            </p>

            <button
              onClick={() => router.push(`/auth/login`)}
              className="w-full bg-[var(--color-brand)] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[var(--color-brand)]/20 transition-transform active:scale-95"
            >
              {t('back_to_login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F3F4F6] flex items-center justify-center p-4 md:p-10 font-sans">
      {/* Main Card */}
      <div className="w-full max-w-[1100px] bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] flex flex-col md:flex-row overflow-hidden min-h-[750px]">

        {/* Left Pane: Artistic 3D Image */}
        <div className="hidden md:flex md:w-1/2 p-4">
          <div className="w-full h-full rounded-[32px] overflow-hidden relative">
            <img
              src="/shared/images/signup.png"
              alt="Artistic 3D Sculpture"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[var(--color-brand)]/5 mix-blend-overlay" />
          </div>
        </div>

        {/* Right Pane: Signup Form */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center">
          <div className="w-full max-w-[450px] mx-auto">

            {/* Logo & Header */}
            <div className="text-center md:text-left mb-10">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-6">
                <div className="w-10 h-10 rounded-xl overflow-hidden">
                  <img src="/shared/images/girllogo.png" alt="Komorng Logo" className="w-full h-full object-cover" />
                </div>
                <span className="text-2xl font-black tracking-tighter text-[var(--color-foreground)]">Komorng</span>
              </div>
              <h1 className="text-4xl font-bold text-[var(--color-foreground)] mb-3 tracking-tight">{t('signup_title')}</h1>
              <div className="flex justify-between items-center">
                <p className="text-[var(--color-muted)] font-medium">
                  {step === 0 ? t('signup_step_verification') : `Step ${step} of 3 — ${step === 1 ? t('signup_step_branding') : step === 2 ? t('signup_step_details') : t('signup_step_verification')}`}
                </p>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'w-8 bg-[var(--color-brand)]' : 'w-2 bg-[var(--color-border)]'}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm font-medium animate-in fade-in slide-in-from-top-1">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Step 0: Identity Verification */}
              {step === 0 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-[#F0F7FF] border border-[#E0EFFF] rounded-[32px] p-8 text-center">
                    <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-3">{t('identity_verification')}</h2>
                    <p className="text-[var(--color-muted)] font-medium mb-8 leading-relaxed">
                      {t('identity_desc')}
                    </p>

                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <TelegramLoginButton
                          botName={config.telegramBotName}
                          onAuth={handleTelegramSuccess}
                          buttonText={t('signup_telegram')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Branding */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[var(--color-foreground)]/70 ml-1">Shop Name (Khmer)</label>
                    <div className="relative group">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)] group-focus-within:text-[var(--color-brand)] transition-colors" />
                      <input
                        required
                        value={formData.storeNameKm}
                        onChange={e => setFormData({ ...formData, storeNameKm: e.target.value })}
                        placeholder="ហាងកាហ្វេ"
                        className="w-full pl-12 pr-4 py-4 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-2xl focus:ring-4 focus:ring-[var(--color-brand)]/10 focus:border-[var(--color-brand)]/50 outline-none text-base transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[var(--color-foreground)]/70 ml-1">Shop Name (English)</label>
                    <div className="relative group">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)] group-focus-within:text-[var(--color-brand)] transition-colors" />
                      <input
                        required
                        value={formData.storeNameEn}
                        onChange={e => setFormData({ ...formData, storeNameEn: e.target.value })}
                        placeholder="Coffee Shop"
                        className="w-full pl-12 pr-4 py-4 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-2xl focus:ring-4 focus:ring-[var(--color-brand)]/10 focus:border-[var(--color-brand)]/50 outline-none text-base transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[var(--color-foreground)]/70 ml-1">{t('store_slug')}</label>
                    <div className="relative group">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)] group-focus-within:text-[var(--color-brand)] transition-colors" />
                      <input
                        required
                        value={formData.slug}
                        onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                        placeholder={t('slug_placeholder')}
                        className="w-full pl-12 pr-28 py-4 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-2xl focus:ring-4 focus:ring-[var(--color-brand)]/10 focus:border-[var(--color-brand)]/50 outline-none text-base transition-all font-medium"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)] text-xs font-bold bg-white px-2 py-1 rounded-lg border border-[var(--color-border)]">
                        .komorng.com
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!formData.storeNameEn || !formData.storeNameKm || !formData.slug}
                    className="w-full mt-8 bg-[var(--color-brand)] text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-[var(--color-brand)]/20 flex items-center justify-center gap-2 group transition-all active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    {t('continue_btn')}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              )}

              {/* Step 2: Details */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700 ml-1">{t('business_category')}</label>
                    <div className="relative">
                      <select
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-4 py-4 bg-[var(--color-background-secondary)] border border-zinc-100 rounded-2xl focus:ring-4 focus:ring-[var(--color-brand)]/10 focus:border-[var(--color-brand)]/50 outline-none text-base transition-all appearance-none cursor-pointer font-medium"
                      >
                        <option value="STALL_KIOSK">{t('cat_stall')}</option>
                        <option value="DINE_IN_TABLE">{t('cat_dinein')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[var(--color-foreground)]/70 ml-1">{t('description_label')}</label>
                    <div className="relative group">
                      <FileText className="absolute left-4 top-4 w-5 h-5 text-[var(--color-muted)] group-focus-within:text-[var(--color-brand)] transition-colors" />
                      <textarea
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('description_placeholder')}
                        rows={4}
                        className="w-full pl-12 pr-4 py-4 bg-[var(--color-bg-alt)] border border-[var(--color-border)] rounded-2xl focus:ring-4 focus:ring-[var(--color-brand)]/10 focus:border-[var(--color-brand)]/50 outline-none text-base transition-all resize-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 mt-8">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 bg-[var(--color-bg-alt)] text-[var(--color-foreground)] py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[var(--color-border)]/50"
                    >
                      <ChevronLeft className="w-5 h-5" />
                      {t('back_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={nextStep}
                      className="flex-[2] bg-[var(--color-brand)] text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-[var(--color-brand)]/20 flex items-center justify-center gap-2 group active:scale-[0.98] transition-all hover:opacity-90"
                    >
                      {t('continue_btn')}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Verification */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-2">
                    <p className="text-sm text-blue-700 leading-relaxed font-medium">
                      {t('upload_info')}
                    </p>
                  </div>

                  <div className="relative group">
                    <input
                      type="file"
                      onChange={e => setFormData({ ...formData, document: e.target.files?.[0] || null })}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className={`w-full py-12 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center transition-all ${formData.document ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-[var(--color-border)] group-hover:border-[var(--color-brand)]/30 bg-[var(--color-bg-alt)]'}`}>
                      {formData.document ? (
                        <>
                          <div className="w-16 h-16 bg-[var(--color-brand)] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-[var(--color-brand)]/20">
                            <CheckCircle2 className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-base font-bold text-[var(--color-foreground)] mb-1">{formData.document.name}</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, document: null }); }}
                            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] flex items-center gap-2 transition-colors font-bold"
                          >
                            <X className="w-4 h-4" />
                            {t('remove')}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform border border-[var(--color-border)]">
                            <Upload className="w-8 h-8 text-[var(--color-brand)]" />
                          </div>
                          <p className="text-base font-bold text-[var(--color-foreground)] mb-1">{t('upload_document')}</p>
                          <p className="text-xs text-[var(--color-muted)]">{t('upload_format')}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 mt-8">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 bg-[var(--color-bg-alt)] text-[var(--color-foreground)] py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[var(--color-border)]/50"
                    >
                      <ChevronLeft className="w-5 h-5" />
                      {t('back_btn')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !formData.document}
                      className="flex-[2] bg-[var(--color-brand)] text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 group active:scale-[0.98] transition-all shadow-lg shadow-[var(--color-brand)]/20 disabled:opacity-30"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <>
                          {t('submit_application')}
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>

            <p className="mt-10 text-center text-[var(--color-muted)] text-sm font-medium">
              {t('already_have')} <Link href={`/auth/login`} className="text-[var(--color-brand)] font-bold hover:underline">{t('log_in')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
