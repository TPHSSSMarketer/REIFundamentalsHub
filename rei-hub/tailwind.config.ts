import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand primary — Deep patriotic blue (#223D7D)
        primary: {
          50: '#EBF0F9',
          100: '#D1DDEF',
          200: '#A3BBE0',
          300: '#7599D0',
          400: '#4A73B8',
          500: '#223D7D',
          600: '#1C3268',
          700: '#162753',
          800: '#101C3D',
          900: '#0A1128',
        },
        // Brand accent — Bold American red (#ED1B24)
        accent: {
          50: '#FEF1F1',
          100: '#FDD8D9',
          200: '#FBABAE',
          300: '#F77D82',
          400: '#F24E55',
          500: '#ED1B24',
          600: '#C8151D',
          700: '#A31017',
          800: '#7D0C11',
          900: '#58080C',
        },
        // Brand neutral — Professional charcoal (#4D4D4D)
        neutral: {
          50: '#F7F7F7',
          100: '#E8E8E8',
          200: '#D1D1D1',
          300: '#B0B0B0',
          400: '#888888',
          500: '#4D4D4D',
          600: '#3D3D3D',
          700: '#2E2E2E',
          800: '#1F1F1F',
          900: '#141414',
        },
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          500: '#10B981',
          600: '#059669',
          800: '#065F46',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          500: '#F59E0B',
          600: '#D97706',
          800: '#92400E',
        },
        danger: {
          50: '#FEF1F1',
          100: '#FDD8D9',
          500: '#ED1B24',
          600: '#C8151D',
        },
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],   // 13px (was 12px)
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],   // 15px (was 14px)
        base: ['1.0625rem', { lineHeight: '1.625rem' }], // 17px (was 16px)
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],    // 19px (was 18px)
        xl: ['1.375rem', { lineHeight: '1.875rem' }],    // 22px (was 20px)
        '2xl': ['1.625rem', { lineHeight: '2rem' }],     // 26px (was 24px)
      },
    },
  },
  plugins: [],
}

export default config
