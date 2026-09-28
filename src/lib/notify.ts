import toast, { type Toast } from 'react-hot-toast';
import { ApiError } from '../api/client';

const baseStyle = { fontSize: '0.875rem' };

/** Human-readable message for an unknown error — use it for inline (non-toast) error text too. */
export function messageOf(input: unknown, fallback: string): string {
  if (!input) return fallback;
  if (typeof input === 'string') return input;
  if (input instanceof ApiError) return input.message;
  if (input instanceof Error) return input.message;
  return fallback;
}

export const notify = {
  success(msg: string) {
    return toast.success(msg, { duration: 3500, style: baseStyle });
  },
  error(input: unknown, fallback = 'Something went wrong') {
    return toast.error(messageOf(input, fallback), { duration: 5000, style: baseStyle });
  },
  info(msg: string) {
    return toast(msg, { duration: 3500, icon: 'i', style: baseStyle });
  },
  warn(msg: string) {
    return toast(msg, { duration: 4000, icon: '!', style: baseStyle });
  },
  promise<T>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((value: T) => string); error: string | ((err: unknown) => string) },
  ) {
    return toast.promise(p, msgs, { style: baseStyle });
  },
  dismiss(t?: Toast | string) {
    return toast.dismiss(typeof t === 'string' ? t : t?.id);
  },
};
