import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from './http-status.js';

/**
 * An error the API reports to the client. `code` is a stable key the web app
 * translates (errors.<code>); `params` fill placeholders in that text.
 */
export class AppError extends Error {
  override readonly name = 'AppError';
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params: Readonly<Record<string, string | number>> = {},
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

export const badRequest = (code: string, params?: Record<string, string | number>): AppError =>
  new AppError(HTTP_BAD_REQUEST, code, params);
export const unauthorized = (code = 'unauthorized'): AppError => new AppError(HTTP_UNAUTHORIZED, code);
export const forbidden = (code = 'forbidden'): AppError => new AppError(HTTP_FORBIDDEN, code);
export const notFound = (code = 'not_found'): AppError => new AppError(HTTP_NOT_FOUND, code);
export const conflict = (code: string, params?: Record<string, string | number>): AppError =>
  new AppError(HTTP_CONFLICT, code, params);

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
