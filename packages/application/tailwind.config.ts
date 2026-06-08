import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand:              'var(--brand)',
        'brand-hover':      'var(--brand-hover)',
        'brand-strong':     'var(--brand-strong)',
        accent:             'var(--accent)',

        // Surfaces
        'surface-app':         'var(--surface-app)',
        'surface-card':        'var(--surface-card)',
        'surface-raised':      'var(--surface-raised)',
        'surface-sunken':      'var(--surface-sunken)',
        'surface-brand-soft':  'var(--surface-brand-soft)',
        'surface-accent-soft': 'var(--surface-accent-soft)',

        // Text roles
        'text-strong':  'var(--text-strong)',
        'text-body':    'var(--text-body)',
        'text-muted':   'var(--text-muted)',
        'text-subtle':  'var(--text-subtle)',
        'on-brand':     'var(--on-brand)',
        'on-accent':    'var(--on-accent)',

        // Borders
        'border-subtle':  'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong':  'var(--border-strong)',
        'border-brand':   'var(--border-brand)',

        // Status
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger:  'var(--danger)',
        info:    'var(--info)',
      },

      fontFamily: {
        serif: ['var(--font-serif)'],
        sans:  ['var(--font-sans)'],
        hand:  ['var(--font-hand)'],
        mono:  ['var(--font-mono)'],
      },

      boxShadow: {
        xs:     'var(--shadow-xs)',
        sm:     'var(--shadow-sm)',
        md:     'var(--shadow-md)',
        lg:     'var(--shadow-lg)',
        xl:     'var(--shadow-xl)',
        inset:  'var(--shadow-inset)',
        brand:  'var(--shadow-brand)',
      },

      borderRadius: {
        xs:   'var(--radius-xs)',
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        pill: 'var(--radius-pill)',
      },

      transitionTimingFunction: {
        soft:     'var(--ease-soft)',
        out:      'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },

      transitionDuration: {
        fast:   'var(--dur-fast)',
        base:   'var(--dur-base)',
        slow:   'var(--dur-slow)',
        slower: 'var(--dur-slower)',
      },
    },
  },
  plugins: [],
};

export default config;
