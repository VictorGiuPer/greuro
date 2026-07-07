/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces (dark theme)
        bg: '#0A0B0F', // app background (near-black)
        card: '#14161B', // card fill
        elevated: '#1B1E25', // inputs / raised controls
        // Accent
        accent: '#2EE8C6', // teal
        'accent-dim': '#1FBFA6',
        // Amount semantics
        expense: '#F87171', // red (-$)
        income: '#4ADE80', // green (+$)
        // Text
        'txt-primary': '#F4F6F8',
        'txt-secondary': '#9BA1AC',
        'txt-muted': '#6B7280',
      },
      borderColor: {
        hairline: 'rgba(255,255,255,0.06)',
      },
      borderRadius: {
        card: '20px',
        tile: '14px',
      },
      boxShadow: {
        fab: '0 0 24px rgba(46,232,198,0.45), 0 8px 24px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
