/* Minimal console declaration for shared package (no DOM or @types/node needed) */
declare var console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};
