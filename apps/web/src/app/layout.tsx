import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
