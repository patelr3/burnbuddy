'use client';

interface GettingStartedCardProps {
  onDismiss: () => void;
}

export function GettingStartedCard({ onDismiss }: GettingStartedCardProps) {
  return (
    <div className="relative mb-6 rounded-lg border border-gray-700 bg-surface px-5 py-4">
      <button
        onClick={onDismiss}
        aria-label="Dismiss getting started card"
        className="absolute top-2.5 right-3 cursor-pointer border-none bg-transparent p-1 text-lg leading-none text-gray-400 hover:text-gray-200"
      >
        ×
      </button>
      <h2 className="mt-0 mb-2 text-lg font-semibold text-white">Getting Started</h2>
      <p className="m-0 leading-relaxed text-gray-300">
        Welcome to BurnBuddy! Here's how to get going:
      </p>
      <ol className="mt-2 mb-0 pl-5 leading-[1.8] text-gray-300">
        <li>
          <strong className="text-primary">Add a friend</strong> — search by
          email on the <strong className="text-primary">Friends</strong> page
          and send them a request
        </li>
        <li>
          <strong className="text-primary">Request a Burn Buddy</strong> — once
          they accept, go to{' '}
          <strong className="text-primary">Burn Buddies</strong> and send a Burn
          Buddy request to start tracking workouts together
        </li>
      </ol>
    </div>
  );
}
