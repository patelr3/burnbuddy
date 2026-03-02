/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@burnbuddy/shared'],
};

export default nextConfig;
