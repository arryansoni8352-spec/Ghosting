/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0B0F17',
          900: '#0F172A',
          850: '#141E33',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        cyber: {
          indigo: '#6366F1',
          violet: '#818CF8',
          sky: '#38BDF8',
          emerald: '#34D399',
          amber: '#FBBF24',
          rose: '#F43F5E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
        glow: '0 0 20px -5px rgba(99, 102, 241, 0.15)',
      },
    },
  },
  plugins: [],
};
