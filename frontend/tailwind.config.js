/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--color-surface)',
          secondary: 'var(--color-surface-secondary)',
          tertiary: 'var(--color-surface-tertiary)',
        },
        content: {
          DEFAULT: 'var(--color-content)',
          secondary: 'var(--color-content-secondary)',
          tertiary: 'var(--color-content-tertiary)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        input: {
          DEFAULT: 'var(--color-input-bg)',
          border: 'var(--color-input-border)',
        },
        hover: 'var(--color-hover)',
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
          hover: 'var(--color-sidebar-hover)',
          border: 'var(--color-sidebar-border)',
        },
        overlay: 'var(--color-modal-overlay)',
      }
    },
  },
  plugins: [],
}
