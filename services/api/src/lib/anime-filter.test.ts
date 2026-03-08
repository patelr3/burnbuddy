import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { animeFilter } from './anime-filter';

/** Create a solid-color test image in the given format. */
async function createTestImage(
  format: 'jpeg' | 'png' | 'webp',
  width = 128,
  height = 128,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3, 0);
  // Fill with a gradient so edge detection has something to work with
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      raw[idx] = Math.floor((x / width) * 255); // R gradient
      raw[idx + 1] = Math.floor((y / height) * 255); // G gradient
      raw[idx + 2] = 128; // B constant
    }
  }

  let pipeline = sharp(raw, { raw: { width, height, channels: 3 } });

  if (format === 'jpeg') pipeline = pipeline.jpeg();
  else if (format === 'png') pipeline = pipeline.png();
  else pipeline = pipeline.webp();

  return pipeline.toBuffer();
}

describe('animeFilter', () => {
  it('produces a valid WebP buffer with 256x256 dimensions', async () => {
    const input = await createTestImage('jpeg');
    const result = await animeFilter(input);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('handles JPEG input', async () => {
    const input = await createTestImage('jpeg');
    const result = await animeFilter(input);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('handles PNG input', async () => {
    const input = await createTestImage('png');
    const result = await animeFilter(input);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('handles WebP input', async () => {
    const input = await createTestImage('webp');
    const result = await animeFilter(input);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('is deterministic — same input produces same output', async () => {
    const input = await createTestImage('jpeg');
    const result1 = await animeFilter(input);
    const result2 = await animeFilter(input);

    expect(result1.equals(result2)).toBe(true);
  });

  it('handles non-square input images', async () => {
    const input = await createTestImage('jpeg', 200, 100);
    const result = await animeFilter(input);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('handles large input images', async () => {
    const input = await createTestImage('jpeg', 1024, 768);
    const result = await animeFilter(input);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  it('processes a 4032×3024 image (iPhone size) in under 10 seconds', async () => {
    const input = await createTestImage('jpeg', 4032, 3024);

    const start = performance.now();
    const result = await animeFilter(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10_000);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });
});
