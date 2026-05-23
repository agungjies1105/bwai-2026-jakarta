/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.html",
    "./public/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        luxury: {
          dark: '#0A0A0A',
          card: '#121212',
          cardHover: '#1A1A1A',
          gold: '#D4AF37',
          goldLight: '#F3E5AB',
          border: '#2A2A2A',
          textMuted: '#A0A0A0'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif']
      }
    },
  },
  plugins: [],
}
