import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FA',
          100: '#D4DEEF',
          200: '#A9BDE0',
          300: '#7E9CD0',
          400: '#5880C0',
          500: '#3D65A8',
          600: '#2F4F87',
          700: '#253F6B',
          800: '#1B2A4A',
          900: '#121C32',
        },
        accent: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FCC8C8',
          300: '#F9A3A3',
          400: '#F47272',
          500: '#E84545',
          600: '#D32F2F',
          700: '#C62828',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          500: '#22c55e',
          600: '#16a34a',
          800: '#166534',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          500: '#f59e0b',
          600: '#d97706',
          800: '#92400e',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}

export default config
