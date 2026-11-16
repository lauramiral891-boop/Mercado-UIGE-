/**
 * Utilitários de sanitização e limite de taxa para registos operacionais.
 * Nunca guarda palavras-passe, chaves API ou tokens JWT.
 */

const RATE_LIMIT_WINDOWS = new Map<string, number[]>();

export function sanitizeTelemetryText(input: unknown, maxLen = 240): string {
  const raw = typeof input === "string" ? input : String(input ?? "");
  const cleaned = raw
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_\-]+/gi, "[chave-removida]")
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[token-removido]")
    .replace(/(password|senha|palavra[- ]?passe|api[_-]?key|service_role|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[oculto]")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, maxLen);
}

export function allowTelemetryWrite(key: string, maxPerMinute = 10, now = Date.now()): boolean {
  const cutoff = now - 60_000;
  const timestamps = (RATE_LIMIT_WINDOWS.get(key) || []).filter((ts) => ts > cutoff);
  if (timestamps.length >= maxPerMinute) {
    RATE_LIMIT_WINDOWS.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  RATE_LIMIT_WINDOWS.set(key, timestamps);
  return true;
}

export function resetTelemetryRateLimits(): void {
  RATE_LIMIT_WINDOWS.clear();
}
