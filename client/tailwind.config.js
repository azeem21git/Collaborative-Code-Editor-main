/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: {
    // Disable Tailwind's global CSS reset so it doesn't conflict
    // with the existing CollaBrix IDE stylesheet.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        charcoal: '#2c3e40',
        cream: '#dcd7c9',
        brown: '#8d6e53',
        darkgreen: '#3a4d39',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

