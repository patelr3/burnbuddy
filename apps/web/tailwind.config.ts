import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#f97316',
        secondary: '#3b82f6',
        success: '#22c55e',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};

export default config;
