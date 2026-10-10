/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // ← включаем поддержку тёмной темы через класс
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      keyframes: {
        borderGlow: {
          '0%, 100%': { 'border-color': '#a855f7' },
          '50%': { 'border-color': '#eab308' },
        },
      },
      animation: {
        borderGlow: 'borderGlow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
