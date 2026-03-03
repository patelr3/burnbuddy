import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

export function GET() {
  logger.info('health check requested');
  return NextResponse.json({ status: 'ok' });
}
