module.exports = {
  theme: {
    extend: {
      colors: {
        // Match the existing color palette
        neutral50: '#fafafa',
        neutral100: '#f5f5f5',
        neutral200: '#e5e5e5',
        neutral300: '#d4d4d4',
        neutral400: '#a3a3a3',
        neutral500: '#737373',
        neutral600: '#525252',
        neutral700: '#404040',
        neutral800: '#262626',
        neutral900: '#171717',
        backdrop: 'rgba(0,0,0,.3)',

        // Mid Breath design tokens
        'mb-bg': '#0A0A0B',
        'mb-bg-elev': '#111114',
        'mb-fg': '#F2F2EF',
        'mb-mute': '#6E6E74',
        'mb-dim': '#2A2A2E',
        'mb-line': 'rgba(255,255,255,0.08)',
        'mb-line-strong': 'rgba(255,255,255,0.16)',
        'mb-accent': '#6FE7FF',
        'mb-accent-soft': 'rgba(111,231,255,0.35)',
        'mb-warn': '#FF6E5A',
      },
      fontFamily: {
        inter: ['Inter'],
        // Mid Breath type stack
        display: ['Rubik-ExtraBold'],
        'display-regular': ['Rubik'],
        mono: ['JetBrainsMono'],
        'mono-medium': ['JetBrainsMono-Medium'],
      },
    },
  },
};
