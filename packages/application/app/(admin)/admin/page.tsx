import { AdminShell } from '@/src/components/admin';
import { Card, Icon } from '@/src/components/ui';

const SECTIONS = [
  {
    href: '/admin/pending',
    icon: 'user-plus',
    label: 'Pending',
    description: 'Review and approve registration requests.',
  },
  {
    href: '/admin/members',
    icon: 'users',
    label: 'Members',
    description: 'Manage roles and access for existing members.',
  },
  {
    href: '/admin/invites',
    icon: 'ticket',
    label: 'Invites',
    description: 'Send email invites or create shareable codes.',
  },
  {
    href: '/admin/ai-settings',
    icon: 'sliders',
    label: 'AI Settings',
    description: 'Tune prompts, models, and generation parameters.',
  },
] as const;

export default function AdminIndexPage() {
  return (
    <AdminShell title="Admin">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
          maxWidth: 880,
        }}
      >
        {SECTIONS.map(({ href, icon, label, description }) => (
          <a
            key={href}
            href={href}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <Card variant="interactive" padded>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'var(--surface-brand-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Icon name={icon} size={22} style={{ color: 'var(--brand-strong)' }} />
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                {description}
              </div>
            </Card>
          </a>
        ))}
      </div>
    </AdminShell>
  );
}
