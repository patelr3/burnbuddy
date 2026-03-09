import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from './logger';

/**
 * Returns a ContainerClient for the given container, authenticated via
 * managed identity (DefaultAzureCredential). Reads AZURE_STORAGE_ACCOUNT_URL.
 */
export function getContainerClient(containerName: string = 'uploads') {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) {
    throw new Error('AZURE_STORAGE_ACCOUNT_URL environment variable is not set');
  }
  const blobServiceClient = new BlobServiceClient(
    accountUrl,
    new DefaultAzureCredential(),
  );
  return blobServiceClient.getContainerClient(containerName);
}

/**
 * Returns the public blob URL for a given path and container.
 */
export function getBlobUrl(
  blobPath: string,
  containerName: string = 'uploads',
): string {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) {
    throw new Error('AZURE_STORAGE_ACCOUNT_URL environment variable is not set');
  }
  return `${accountUrl}/${containerName}/${blobPath}`;
}

/**
 * Lightweight connectivity check at startup.
 * Logs a warning if the container is unreachable — does NOT block startup.
 */
export async function checkStorageConnectivity(): Promise<void> {
  try {
    const containerClient = getContainerClient('uploads');
    const exists = await containerClient.exists();
    if (!exists) {
      logger.warn(
        { container: 'uploads' },
        'Azure Blob Storage container does not exist — uploads will fail',
      );
    } else {
      logger.info(
        { container: 'uploads' },
        'Azure Blob Storage container verified',
      );
    }
  } catch (err) {
    logger.warn(
      { err },
      'Azure Blob Storage connectivity check failed — storage features may not work',
    );
  }
}
