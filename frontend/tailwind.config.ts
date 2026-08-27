import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff8ff',
          100: '#dbefff',
          200: '#bfe4ff',
          300: '#93d4ff',
          400: '#5fbaff',
          500: '#2f9be8',
          600: '#1d7cc4',
          700: '#1a63a0',
          800: '#1a5384',
          900: '#1b466d'
        },
        teal: {
          50: '#effcf9',
          100: '#c9f6ea',
          500: '#0f9c8f',
          600: '#0c7d73',
          700: '#0a635c'
        }
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.08)'
      },
      borderRadius: {
        xl2: '1rem'
      }
    }
  },
  plugins: []
} satisfies Config;
