/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forecast: {
          bg: '#fef3c7',
          text: '#92400e',
          border: '#fcd34d'
        }
      }
    },
  },
  plugins: [],
}
