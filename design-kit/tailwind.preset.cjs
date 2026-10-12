/** ӘЙДӘ ИНДЕ! — Tailwind preset. Использование: tailwind.config.js → presets: [require('./tokens/tailwind.preset.js')] */
module.exports = {
  theme: {
    extend: {
      colors: {
        "ground": "#f4f3f0",
        "surface": "#ffffff",
        "surface-sunken": "#f4f3f0",
        "glass": "rgba(255,255,255,0.92)",
        "ink": "#17181a",
        "ink-muted": "#55575b",
        "ink-subtle": "#6e7074",
        "on-ink": "#ffffff",
        "line": "#e2e0db",
        "accent": "#1f7a7a",
        "accent-soft": "#e3eeec",
        "accent-on-ink": "#7fc4bf",
        "sunset": "#e9b48a",
        "sunset-soft": "#f6e6d6",
        "peach": "#f3dcc8",
        "danger": "#b3261e"
      },
      fontFamily: {
        display: ['Unbounded', 'Onest', 'system-ui', 'sans-serif'],
        sans: ['Onest', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      spacing: {
        "k1": "4px",
        "k2": "8px",
        "k3": "12px",
        "k4": "16px",
        "k5": "20px",
        "k6": "28px"
      },
      borderRadius: {
        "s": "16px",
        "m": "22px",
        "l": "28px",
        "full": "999px"
      },
      boxShadow: { float: '0 6px 20px rgba(23,24,26,0.12)' },
      fontSize: {
        wordmark: ['20px', { lineHeight: '24px', letterSpacing: '0.04em', fontWeight: '600' }],
        promo: ['22px', { lineHeight: '28px', letterSpacing: '0.01em', fontWeight: '500' }],
        h1: ['30px', { lineHeight: '34px', letterSpacing: '-0.025em', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '26px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'card-title': ['16px', { lineHeight: '20px', fontWeight: '600' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '400' }],
        label: ['14px', { lineHeight: '18px', fontWeight: '500' }],
        meta: ['13px', { lineHeight: '18px', fontWeight: '400' }],
      },
    },
  },
};
