import { NavBar } from '@/components/NavBar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pb-20 md:pb-0">
      <NavBar />
      {children}
    </div>
  );
}
