import type { Metadata } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
