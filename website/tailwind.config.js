/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "After the Rain" Palette
        rainforest: {
          950: '#121A14', // deep forest night floor
          900: '#18221B', // deep foliage shadow
          850: '#1E2B22', // wet canopy shadow
          800: '#28382D', // Base Rainforest
          750: '#2E3F33',
          700: '#364A3D', // muted canopy
          600: '#465E4E', // soft leaf green
        },
        fern: {
          900: '#263324',
          800: '#3E523A',
          700: '#526B4C', // Wet Fern
          600: '#688561',
          500: '#819F7A',
          400: '#9DBA96',
        },
        moss: {
          900: '#3D4029',
          800: '#5F6441',
          700: '#7E8557',
          DEFAULT: '#A3AA78', // Moss
          500: '#A3AA78',
          400: '#B5BC8E',
          300: '#C9CFA5',
          200: '#DCE0C2',
          100: '#EEF0E0',
        },
        amber: {
          900: '#573E18',
          800: '#7D5B24',
          700: '#A87C33',
          DEFAULT: '#D6A65D', // Amber sunlight
          500: '#D6A65D',
          400: '#E2BC7A',
          300: '#EDD29C',
          200: '#F5E5C4',
          100: '#FAF2E3',
        },
        ivory: {
          DEFAULT: '#F2EBDD', // Ivory text
          50: '#FDFCFA',
          100: '#F2EBDD',
          200: '#E5DECF',
          300: '#D8D1C3',
          400: '#C2BBAE',
          500: '#A8A295',
        },
        blossom: {
          900: '#5E2738',
          800: '#8C3B54',
          700: '#B85573',
          DEFAULT: '#E58BAA', // Blossom pink accent
          500: '#E58BAA',
          400: '#EDA7BF',
          300: '#F4C5D4',
          200: '#FAE3EB',
        },

        // Mappings for existing utility classes to guarantee complete site-wide consistency
        navy: {
          950: '#121A14',
          900: '#18221B',
          850: '#1E2B22',
          800: '#28382D',
          700: '#364A3D',
          600: '#526B4C',
        },
        cyber: {
          indigo: '#D6A65D', // Warm amber sunlight
          violet: '#A3AA78', // Matcha moss
          sky: '#819F7A',    // Wet fern light
          emerald: '#A3AA78',// Fresh moss
          amber: '#D6A65D',  // Warm amber
          rose: '#E58BAA',   // Blossom pink
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Space Mono', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        space: ['Space Mono', 'monospace'],
        jetbrains: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        subtle: '0 2px 6px -1px rgba(10, 16, 12, 0.45), 0 1px 3px -1px rgba(0, 0, 0, 0.3)',
        card: '0 8px 24px -4px rgba(8, 14, 10, 0.5), inset 0 1px 1px 0 rgba(242, 235, 221, 0.12)',
        glossy: '0 10px 30px -4px rgba(8, 14, 10, 0.6), inset 0 1px 2px 0 rgba(242, 235, 221, 0.22)',
        amberGlow: '0 0 24px -2px rgba(214, 166, 93, 0.25)',
        mossGlow: '0 0 20px -3px rgba(163, 170, 120, 0.22)',
      },
    },
  },
  plugins: [],
};
