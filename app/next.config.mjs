/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["blackbox-engine", "blackbox-fixtures"],
  reactStrictMode: true,
  webpack: (config) => {
    // The engine is written as proper ESM TypeScript (NodeNext), so its
    // internal imports use explicit ".js" specifiers that map to ".ts" files.
    // Teach webpack to resolve them the same way tsc with bundler
    // resolution does.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};
export default nextConfig;
