import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { WebVitalsReporter } from '@/components/web-vitals-reporter';
import './globals.css';

export const metadata: Metadata = {
  title: 'BurnBuddy',
  description: 'Motivate your buddies to burn calories',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        <WebVitalsReporter />
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
