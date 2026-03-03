'use client';

interface GettingStartedCardProps {
  onDismiss: () => void;
}

export function GettingStartedCard({ onDismiss }: GettingStartedCardProps) {
  return (
    <div className="relative mb-6 rounded-lg border border-slate-200 bg-green-50 px-5 py-4">
      <button
        onClick={onDismiss}
        aria-label="Dismiss getting started card"
        className="absolute top-2.5 right-3 cursor-pointer border-none bg-transparent p-1 text-lg leading-none text-slate-500 hover:text-slate-700"
      >
        ×
      </button>
      <h2 className="mt-0 mb-2 text-lg font-semibold">Getting Started</h2>
      <p className="m-0 leading-relaxed text-gray-700">
        Welcome to BurnBuddy! To get started, add your first friend:
      </p>
      <ol className="mt-2 mb-0 pl-5 leading-[1.8] text-gray-700">
        <li>Go to the <strong>Friends</strong> page</li>
        <li>Search for a friend by email address</li>
        <li>Send them a friend request</li>
        <li>Once they accept, you can create a <strong>Burn Buddy</strong> or <strong>Burn Squad</strong> together</li>
      </ol>
    </div>
  );
}
