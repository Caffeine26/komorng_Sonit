import { useQrSessionContext } from '@/providers/qr-session-provider';

export function useQrSession() {
  return useQrSessionContext();
}
