/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@transformmynotes/core'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      ...(config.resolve.extensionAlias || {}),
    };
    return config;
  },
};
export default nextConfig;
