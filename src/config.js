export const DEFAULT_API_BASE = '/api';

export function resolveApiBase(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_API_BASE;
  const normalized = raw.endsWith('/') && raw !== '/' ? raw.slice(0, -1) : raw;
  return normalized || DEFAULT_API_BASE;
}
