/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // GHOSTING Editorial White System
        background: '#FFFFFF',
        secondary: '#F8F9FA',
        border: '#EAEAEA',
        hover: '#F3F4F6',
        neutral: {
          50: '#F8F9FA',
          100: '#F3F4F6',
          200: '#EAEAEA',
          300: '#E5E5E5',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#333333',
          800: '#262626',
          900: '#171717',
          950: '#0A0A0A',
        },
        ghost: {
          black: '#171717',
          charcoal: '#333333',
          muted: '#737373',
          border: '#EAEAEA',
          surface: '#F8F9FA',
          hover: '#F3F4F6',
          white: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#171717',
          hover: '#333333',
          soft: '#F8F9FA',
        },
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        floating: '0 12px 32px -4px rgba(0, 0, 0, 0.06)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
