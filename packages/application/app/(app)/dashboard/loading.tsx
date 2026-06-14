/**
 * Next.js route loading UI for the dashboard.
 * Shown automatically during soft navigations (e.g. after sign-in redirects)
 * while the dashboard server component renders.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading dashboard…" className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
      {/* Visually-hidden text for screen readers */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        Loading dashboard…
      </span>

      {/* Greeting bar skeleton */}
      <div className="animate-pulse mb-6">
        <div
          style={{
            height: 28,
            width: '55%',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 16,
            width: '35%',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-sunken)',
          }}
        />
      </div>

      {/* Note card placeholders */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse mb-4"
          style={{
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface-card)',
            boxShadow: 'var(--shadow-sm)',
            padding: '16px 20px',
          }}
        >
          {/* Card title */}
          <div
            style={{
              height: 18,
              width: i === 0 ? '70%' : i === 1 ? '50%' : '60%',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-sunken)',
              marginBottom: 10,
            }}
          />
          {/* Card body lines */}
          <div
            style={{
              height: 14,
              width: '90%',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-sunken)',
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 14,
              width: i === 1 ? '75%' : '85%',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-sunken)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
