/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev, webpack }) => {
    // Tắt webpack cache ở production: một số môi trường (sandbox/CI) không cho
    // ghi thư mục cache làm build lỗi "No such file or directory".
    if (!dev) config.cache = false;
    return config;
  },
};
module.exports = nextConfig;
