import { logger } from '../lib/logger';
import type { CartoonService } from './cartoon-service';

/**
 * No-op cartoon service used when REPLICATE_API_TOKEN is not configured.
 * Returns null to signal that cartoon conversion should be skipped.
 */
export class PassthroughCartoonService implements CartoonService {
  async cartoonize(_imageUrl: string): Promise<null> {
    return null;
  }
}

const REPLICATE_API_BASE = 'https://api.replicate.com';
const MODEL_VERSION =
  '3f91ee385785d4eb3dd6c14d2c80dcfd82d2b607fde4bdd610092c8fee8d81bb';
const TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[];
  error?: string;
}

export class ReplicateCartoonService implements CartoonService {
  private readonly apiToken: string;

  constructor(apiToken?: string) {
    const token = apiToken ?? process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error(
        'REPLICATE_API_TOKEN is required. Set it as an environment variable or pass it to the constructor.',
      );
    }
    this.apiToken = token;
  }

  async cartoonize(imageUrl: string): Promise<Buffer> {
    const prediction = await this.createPrediction(imageUrl);
    const completed = await this.pollPrediction(prediction.id);

    if (!completed.output || completed.output.length === 0) {
      throw new Error('Cartoon conversion returned no output');
    }

    const outputUrl = completed.output[0];
    return this.downloadOutput(outputUrl);
  }

  private async createPrediction(imageUrl: string): Promise<ReplicatePrediction> {
    const response = await fetch(`${REPLICATE_API_BASE}/v1/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: MODEL_VERSION,
        input: {
          image: imageUrl,
          strength: 0.7,
          num_outputs: 1,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Replicate API error (${response.status}): ${body}`,
      );
    }

    return response.json() as Promise<ReplicatePrediction>;
  }

  private async pollPrediction(predictionId: string): Promise<ReplicatePrediction> {
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      const response = await fetch(
        `${REPLICATE_API_BASE}/v1/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Token ${this.apiToken}`,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Replicate poll error (${response.status}): ${body}`,
        );
      }

      const prediction = (await response.json()) as ReplicatePrediction;

      if (prediction.status === 'succeeded') {
        return prediction;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(
          `Cartoon conversion ${prediction.status}: ${prediction.error ?? 'unknown error'}`,
        );
      }

      logger.debug(
        { predictionId, status: prediction.status },
        'Polling cartoon conversion...',
      );

      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `Cartoon conversion timed out after ${TIMEOUT_MS / 1000} seconds`,
    );
  }

  private async downloadOutput(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download cartoon output (${response.status})`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
