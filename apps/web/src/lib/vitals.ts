import type { Metric } from 'web-vitals';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function sendToAPI(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    delta: metric.delta,
    navigationType: metric.navigationType,
    rating: metric.rating,
  });

  // Fire-and-forget: use sendBeacon for reliability (survives page unload),
  // fall back to fetch if sendBeacon is unavailable
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${API_BASE}/metrics/vitals`,
      new Blob([body], { type: 'application/json' }),
    );
  } else {
    fetch(`${API_BASE}/metrics/vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Swallow errors — metrics reporting must never affect the user experience
    });
  }
}

function logToConsole(metric: Metric): void {
  const color =
    metric.rating === 'good'
      ? 'color: green'
      : metric.rating === 'needs-improvement'
        ? 'color: orange'
        : 'color: red';

  console.log(
    `%c[Web Vital] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
    color,
  );
}

export function reportWebVitals(): void {
  // Dynamic import keeps web-vitals out of the main bundle
  import('web-vitals').then(({ onLCP, onFCP, onTTFB, onCLS, onINP }) => {
    const report =
      process.env.NODE_ENV === 'production' ? sendToAPI : logToConsole;

    onLCP(report);
    onFCP(report);
    onTTFB(report);
    onCLS(report);
    onINP(report);
  });
}
