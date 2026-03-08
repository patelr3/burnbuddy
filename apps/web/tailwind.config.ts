import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF9500',
        secondary: '#0A84FF',
        surface: '#1C1C1E',
        'surface-elevated': '#2C2C2E',
        'accent-pink': '#FF2D55',
        success: '#22c55e',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};

export default config;
