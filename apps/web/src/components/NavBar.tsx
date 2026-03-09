'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useAuth } from '@/lib/auth-context';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#FF2D55' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FriendsIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#FF2D55' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AccountIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#FF2D55' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const navItems = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/friends', label: 'Friends', Icon: FriendsIcon },
  { href: '/account', label: 'Account', Icon: AccountIcon },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const desktopLinkClass = (href: string) =>
    `text-sm no-underline transition-colors ${isActive(href) ? 'text-accent-pink font-semibold' : 'text-gray-400 hover:text-white'}`;

  return (
    <>
      {/* Desktop top bar */}
      <nav className="sticky top-0 z-40 hidden border-b border-gray-800 bg-black/90 backdrop-blur-md md:block">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold text-white no-underline">
            🔥 BurnBuddy
          </Link>
          <div className="flex items-center gap-5">
            {navItems.map(({ href, label }) => (
              <Link key={href} href={href} className={desktopLinkClass(href)}>
                {label}
              </Link>
            ))}
            {user && (
              <button
                onClick={handleSignOut}
                className="cursor-pointer rounded-md border border-gray-700 bg-surface px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-surface-elevated hover:text-white"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-black/95 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-2">
          {navItems.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-5 py-1.5 no-underline transition-colors ${
                  active ? 'bg-primary/15' : ''
                }`}
              >
                <Icon active={active} />
                <span className={`text-[10px] font-medium ${active ? 'text-accent-pink' : 'text-gray-500'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
