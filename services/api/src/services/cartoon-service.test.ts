import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before imports
vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockJpegBuffer = Buffer.from('fake-jpeg-output');
const mockJpeg = vi.fn().mockReturnThis();
const mockToBuffer = vi.fn().mockResolvedValue(mockJpegBuffer);

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    jpeg: mockJpeg,
    toBuffer: mockToBuffer,
  })),
}));

const TEST_API_TOKEN = 'test-replicate-token';
const TEST_PREDICTION_ID = 'pred-abc123';
const TEST_OUTPUT_URL = 'https://replicate.delivery/output/test-image.webp';

// Fake image URL
const inputUrl = 'https://burnbuddybetasa.blob.core.windows.net/uploads/profile-pictures/user1/original.jpeg';
const outputBuffer = Buffer.from('fake-cartoon-output');

import sharpModule from 'sharp';
import { ReplicateCartoonService } from './replicate-cartoon-service';

describe('ReplicateCartoonService', () => {
  let service: ReplicateCartoonService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(sharpModule).mockClear();
    mockJpeg.mockClear();
    mockToBuffer.mockClear().mockResolvedValue(mockJpegBuffer);
    service = new ReplicateCartoonService(TEST_API_TOKEN);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('throws if no API token is provided', () => {
    const original = process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;
    try {
      expect(() => new ReplicateCartoonService()).toThrow('REPLICATE_API_TOKEN is required');
    } finally {
      if (original) process.env.REPLICATE_API_TOKEN = original;
    }
  });

  it('reads API token from environment if not passed to constructor', () => {
    const original = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = 'env-token';
    try {
      const envService = new ReplicateCartoonService();
      expect(envService).toBeInstanceOf(ReplicateCartoonService);
    } finally {
      if (original) {
        process.env.REPLICATE_API_TOKEN = original;
      } else {
        delete process.env.REPLICATE_API_TOKEN;
      }
    }
  });

  describe('cartoonize', () => {
    it('successfully converts an image and returns a buffer', async () => {
      // Mock create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'starting',
          }),
      });

      // Mock poll - succeeded immediately
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'succeeded',
            output: [TEST_OUTPUT_URL],
          }),
      });

      // Mock download output
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(outputBuffer.buffer.slice(
          outputBuffer.byteOffset,
          outputBuffer.byteOffset + outputBuffer.byteLength,
        )),
      });

      const result = await service.cartoonize(inputUrl);

      expect(result).toBeInstanceOf(Buffer);
      expect(Buffer.from(result).toString()).toBe(mockJpegBuffer.toString());

      // Verify create prediction call
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.replicate.com/v1/predictions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Token ${TEST_API_TOKEN}`,
            'Content-Type': 'application/json',
          }),
        }),
      );

      // Verify the request body contains the updated Replicate parameters
      const createCall = fetchMock.mock.calls[0];
      const body = JSON.parse(createCall[1].body);
      expect(body.input.image).toBe(inputUrl);
      expect(body.input.strength).toBe(0.5);
      expect(body.input.guidance_scale).toBe(6);
      expect(body.input.negative_prompt).toBe('');
      expect(body.input.num_inference_steps).toBe(20);
      expect(body.input.num_outputs).toBe(1);
      expect(body.version).toBe(
        '3f91ee385785d4eb3dd6c14d2c80dcfd82d2b607fde4bdd610092c8fee8d81bb',
      );

      // Verify downloaded output is converted to JPEG via sharp
      expect(sharpModule).toHaveBeenCalledWith(expect.any(Buffer));
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 90 });

      // Verify poll call
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.replicate.com/v1/predictions/${TEST_PREDICTION_ID}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Token ${TEST_API_TOKEN}`,
          }),
        }),
      );

      // Verify download call
      expect(fetchMock).toHaveBeenCalledWith(TEST_OUTPUT_URL);
    });

    it('polls multiple times until prediction succeeds', async () => {
      // Create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Poll 1 - still processing
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'processing' }),
      });

      // Poll 2 - succeeded
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'succeeded',
            output: [TEST_OUTPUT_URL],
          }),
      });

      // Download output
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(outputBuffer.buffer.slice(
          outputBuffer.byteOffset,
          outputBuffer.byteOffset + outputBuffer.byteLength,
        )),
      });

      const cartoonizePromise = service.cartoonize(inputUrl);

      // Advance past the first poll interval
      await vi.advanceTimersByTimeAsync(1_000);
      // Advance past the second poll
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await cartoonizePromise;
      expect(result).toBeInstanceOf(Buffer);
      expect(fetchMock).toHaveBeenCalledTimes(4); // create + 2 polls + download
    });

    it('throws an error when prediction fails', async () => {
      // Create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Poll - failed
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'failed',
            error: 'Model inference error',
          }),
      });

      await expect(
        service.cartoonize(inputUrl),
      ).rejects.toThrow('Cartoon conversion failed: Model inference error');
    });

    it('throws an error when create prediction API returns non-OK', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve('Invalid input'),
      });

      await expect(
        service.cartoonize(inputUrl),
      ).rejects.toThrow('Replicate API error (422): Invalid input');
    });

    it('throws an error when poll API returns non-OK', async () => {
      // Create prediction succeeds
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Poll returns error
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(
        service.cartoonize(inputUrl),
      ).rejects.toThrow('Replicate poll error (500): Internal server error');
    });

    it('throws a timeout error after 600 seconds of polling', async () => {
      // Create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Always return processing on poll
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'processing' }),
      });

      const cartoonizePromise = service.cartoonize(inputUrl);

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const assertionPromise = expect(cartoonizePromise).rejects.toThrow(
        'Cartoon conversion timed out after 600 seconds',
      );

      // Advance past the 600-second timeout
      await vi.advanceTimersByTimeAsync(601_000);

      await assertionPromise;
    });

    it('throws when prediction returns empty output', async () => {
      // Create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Poll - succeeded but empty output
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'succeeded',
            output: [],
          }),
      });

      await expect(
        service.cartoonize(inputUrl),
      ).rejects.toThrow('Cartoon conversion returned no output');
    });

    it('throws when output download fails', async () => {
      // Create prediction
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: TEST_PREDICTION_ID, status: 'starting' }),
      });

      // Poll - succeeded
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: TEST_PREDICTION_ID,
            status: 'succeeded',
            output: [TEST_OUTPUT_URL],
          }),
      });

      // Download fails
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        service.cartoonize(inputUrl),
      ).rejects.toThrow('Failed to download cartoon output (404)');
    });
  });
});
