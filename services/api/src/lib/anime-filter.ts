import sharp from 'sharp';

/**
 * Sobel edge-detection kernels (3×3).
 * Applied as raw convolution to detect horizontal and vertical edges.
 */
const SOBEL_X: sharp.Kernel = {
  width: 3,
  height: 3,
  kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
};

const SOBEL_Y: sharp.Kernel = {
  width: 3,
  height: 3,
  kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
};

const OUTPUT_SIZE = 256;

/**
 * Transforms a photo into an anime/cartoon style using sharp.
 *
 * Pipeline:
 *  1. Posterize — blur (sigma 2) + boost saturation (1.8×)
 *  2. Edge detection — greyscale → Sobel convolution → threshold
 *  3. Composite — overlay edges onto posterized with "multiply" blend
 *  4. Resize to 256×256 cover/crop → WebP output
 *
 * Operates entirely on in-memory buffers with deterministic output.
 */
export async function animeFilter(inputBuffer: Buffer): Promise<Buffer> {
  // Normalize input: decode to raw RGBA at a consistent size for deterministic results
  const normalized = sharp(inputBuffer).rotate(); // auto-rotate per EXIF

  const metadata = await normalized.metadata();
  const width = metadata.width ?? OUTPUT_SIZE;
  const height = metadata.height ?? OUTPUT_SIZE;

  // Step 1: Posterize — blur + boost saturation for flat cel-shaded look
  const posterized = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .blur(2)
    .modulate({ saturation: 1.8 })
    .toBuffer();

  // Step 2: Edge detection — greyscale Sobel + threshold to get dark outlines
  const edgesX = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .greyscale()
    .convolve(SOBEL_X)
    .toBuffer();

  const edgesY = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .greyscale()
    .convolve(SOBEL_Y)
    .toBuffer();

  // Combine X and Y edges via composite (darken blend picks up edges from both)
  // Then negate + threshold so edges are dark lines on white
  const combinedEdges = await sharp(edgesX)
    .composite([{ input: edgesY, blend: 'darken' }])
    .negate({ alpha: false })
    .threshold(200)
    .toColourspace('srgb')
    .toBuffer();

  // Step 3: Composite edges onto posterized with multiply blend
  const composited = await sharp(posterized)
    .composite([{ input: combinedEdges, blend: 'multiply' }])
    .toBuffer();

  // Step 4: Resize to 256×256 and output as WebP
  const output = await sharp(composited)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
    .webp()
    .toBuffer();

  return output;
}
