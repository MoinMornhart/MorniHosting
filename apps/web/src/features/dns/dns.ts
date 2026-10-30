import type { DnsStatus } from '@mornihosting/shared';
import { api } from '@/lib/api';

export const dnsStatusQuery = {
  queryKey: ['dns'],
  queryFn: () => api<DnsStatus>('/api/dns'),
} as const;
