export interface CartoonService {
  /**
   * Converts an image buffer into a cartoon/comic-book style version.
   * @param imageBuffer - The input image as a Buffer
   * @param mimeType - MIME type of the input image (e.g., 'image/webp')
   * @returns A Buffer containing the cartoon-styled image
   */
  cartoonize(imageBuffer: Buffer, mimeType: string): Promise<Buffer>;
}
