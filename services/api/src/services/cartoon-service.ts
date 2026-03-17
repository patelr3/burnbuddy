export interface CartoonService {
  /**
   * Converts an image into a cartoon/comic-book style version.
   * @param imageUrl - A publicly accessible URL for the input image
   * @returns A Buffer containing the cartoon-styled image, or null to skip conversion
   */
  cartoonize(imageUrl: string): Promise<Buffer | null>;
}
