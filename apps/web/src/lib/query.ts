import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { ApiError } from './api';

const STALE_SECONDS = 15;
const MS_PER_SECOND = 1000;
const MAX_RETRIES = 2;
const HTTP_CLIENT_ERRORS_FROM = 400;
const HTTP_SERVER_ERRORS_FROM = 500;
const MISSING_PERMISSION = 'missing_permission_';

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code.startsWith(MISSING_PERMISSION)) {
      const permission = err.code.slice(MISSING_PERMISSION.length);
      return i18n.t('errors.missing_permission', {
        permission: i18n.t(`permissions.${permission}`, { defaultValue: permission }),
      });
    }
    const key = `errors.${err.code}`;
    return i18n.exists(key) ? i18n.t(key, err.params) : i18n.t('errors.generic');
  }
  if (err instanceof TypeError) return i18n.t('errors.network');
  return i18n.t('errors.generic');
}

export function toastError(err: unknown): void {
  toast.error(errorText(err));
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_SECONDS * MS_PER_SECOND,
      refetchOnWindowFocus: true,
      retry: (failures, err) => {
        const clientError =
          err instanceof ApiError &&
          err.status >= HTTP_CLIENT_ERRORS_FROM &&
          err.status < HTTP_SERVER_ERRORS_FROM;
        return !clientError && failures < MAX_RETRIES;
      },
    },
    mutations: { onError: toastError },
  },
});
