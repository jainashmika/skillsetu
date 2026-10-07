/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F8F4', surface: '#FFFFFF', line: '#E2E7DF', mist: '#EDF2EC',
        ink: { DEFAULT: '#16233F', soft: '#4A566B', faint: '#7A8496' },
        teal: { 50: '#E7F4F2', 100: '#CDEAE6', 500: '#138A86', 600: '#0F6E6E', 700: '#0B5656' },
        marigold: { 50: '#FFF6DE', 100: '#FDE9B0', 400: '#F7BE2E', 500: '#F2A900', 700: '#A36F00' },
        indigo: { 500: '#3B4BA8' }, rose: { 600: '#C2410C' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Noto Sans Devanagari"', '"Noto Sans Kannada"', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', '"Noto Sans Devanagari"', '"Noto Sans Kannada"', 'system-ui', 'sans-serif'],
      },
      boxShadow: { lift: '0 1px 2px rgba(22,35,63,.05), 0 8px 24px -12px rgba(22,35,63,.18)' },
    },
  },
  plugins: [],
};
