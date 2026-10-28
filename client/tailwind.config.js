/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        // Indeterminate bar: RTL-friendly sweep across the track.
        sweep: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-300%)' },
        },
      },
      animation: {
        sweep: 'sweep 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
