import type { ReactNode } from 'react';
import { AdminClientLayout } from '@/components/layout/AdminClientLayout';

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
