import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockLoggerInfo } = vi.hoisted(() => {
  const mockLoggerInfo = vi.fn();
  return { mockLoggerInfo };
});

vi.mock('../lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import metricsRouter from './metrics';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/metrics', metricsRouter);
  return app;
}

describe('POST /metrics/vitals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('accepts a valid LCP metric and returns 204', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ name: 'LCP', value: 1234.5 });

    expect(res.status).toBe(204);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'LCP', value: 1234.5 }),
      'Web vital: LCP',
    );
  });

  it('accepts all valid metric names', async () => {
    const app = buildApp();
    for (const name of ['LCP', 'FCP', 'TTFB', 'CLS', 'INP']) {
      const res = await request(app)
        .post('/metrics/vitals')
        .send({ name, value: 42 });
      expect(res.status).toBe(204);
    }
    expect(mockLoggerInfo).toHaveBeenCalledTimes(5);
  });

  it('accepts optional metadata fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({
        name: 'CLS',
        value: 0.05,
        id: 'v4-abc123',
        delta: 0.02,
        navigationType: 'navigate',
        rating: 'good',
        metadata: { page: '/dashboard', userAgent: 'test' },
      });

    expect(res.status).toBe(204);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'CLS',
        value: 0.05,
        id: 'v4-abc123',
        delta: 0.02,
        navigationType: 'navigate',
        rating: 'good',
        metadata: { page: '/dashboard', userAgent: 'test' },
      }),
      'Web vital: CLS',
    );
  });

  it('returns 400 when name is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ value: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  it('returns 400 for an invalid metric name', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ name: 'INVALID', value: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid metric name/);
  });

  it('returns 400 when value is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ name: 'FCP' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value is required/);
  });

  it('returns 400 when value is not a number', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ name: 'FCP', value: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value is required/);
  });

  it('does not require authentication', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/metrics/vitals')
      .send({ name: 'TTFB', value: 250 });

    // No auth header sent, yet should succeed
    expect(res.status).toBe(204);
  });
});
