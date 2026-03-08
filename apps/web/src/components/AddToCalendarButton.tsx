'use client';

import { useState } from 'react';
import { apiDownloadBlob } from '@/lib/api';

export function AddToCalendarButton({ endpoint }: { endpoint: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setDownloading(true);
    setError(null);
    try {
      await apiDownloadBlob(endpoint, 'burnbuddy-workout.ics');
    } catch {
      setError('Failed to download calendar file');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={downloading}
        className="cursor-pointer rounded-md border border-[#3A3A3C] bg-surface-elevated px-3.5 py-1.5 text-[13px] text-white hover:bg-[#3A3A3C] disabled:opacity-50"
      >
        {downloading ? (
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Downloading…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">📅 Add to Calendar</span>
        )}
      </button>
      {error && <span className="text-[12px] text-red-600">{error}</span>}
    </div>
  );
}
