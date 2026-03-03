'use client';

interface GettingStartedCardProps {
  onDismiss: () => void;
}

export function GettingStartedCard({ onDismiss }: GettingStartedCardProps) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 24,
        backgroundColor: '#f0fdf4',
        position: 'relative',
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss getting started card"
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          background: 'none',
          border: 'none',
          fontSize: 18,
          cursor: 'pointer',
          color: '#64748b',
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18 }}>Getting Started</h2>
      <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>
        Welcome to BurnBuddy! To get started, add your first friend:
      </p>
      <ol style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20, color: '#374151', lineHeight: 1.8 }}>
        <li>Go to the <strong>Friends</strong> page</li>
        <li>Search for a friend by email address</li>
        <li>Send them a friend request</li>
        <li>Once they accept, you can create a <strong>Burn Buddy</strong> or <strong>Burn Squad</strong> together</li>
      </ol>
    </div>
  );
}
