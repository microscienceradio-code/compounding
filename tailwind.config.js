/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#121412',
          900: '#181B18',
          800: '#20241F',
          700: '#2B302A',
          600: '#3A403768',
        },
        paper: {
          100: '#EFEDE6',
          200: '#DBD8CC',
          300: '#B8B4A5',
        },
        moss: {
          400: '#7FA98B',
          500: '#5B8C71',
          600: '#456B57',
          700: '#345040',
        },
        ember: {
          500: '#C97A4A',
        },
        rose: {
          500: '#B4665F',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
}
