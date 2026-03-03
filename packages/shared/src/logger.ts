/**
 * Logger interface matching the pino logger API surface used across the app.
 * Use this interface for dependency injection in tests or when swapping implementations.
 */
export interface Logger {
  info: (obj: object | string, msg?: string) => void;
  warn: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  debug: (obj: object | string, msg?: string) => void;
}

/**
 * Lightweight logger stub for use in apps/mobile (React Native).
 * Wraps console methods to match the Logger interface without requiring pino.
 */
export function createMobileLogger(name?: string): Logger {
  const prefix = name ? `[${name}] ` : '';
  return {
    info: (obj, msg) =>
      console.log(`${prefix}${msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj))}`),
    warn: (obj, msg) =>
      console.warn(`${prefix}${msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj))}`),
    error: (obj, msg) =>
      console.error(`${prefix}${msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj))}`),
    debug: (obj, msg) =>
      console.debug(`${prefix}${msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj))}`),
  };
}
