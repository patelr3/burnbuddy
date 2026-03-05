'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useAuth } from '@/lib/auth-context';

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  const linkClass = (href: string) =>
    `text-sm no-underline ${pathname === href ? 'text-primary font-semibold' : 'text-gray-500 hover:text-gray-700'}`;

  return (
    <nav className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-gray-900 no-underline">
          BurnBuddy
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/friends" className={linkClass('/friends')}>
            Friends
          </Link>
          <Link href="/account" className={linkClass('/account')}>
            Account
          </Link>
          <Link href="/settings" className={linkClass('/settings')}>
            Settings
          </Link>
          {user && (
            <button
              onClick={handleSignOut}
              className="cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
