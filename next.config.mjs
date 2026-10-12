/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite (локальная БД) и pg грузят нативные/WASM-файлы сами; в бандл их упаковывать нельзя
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Разрешённые домены картинок (изображения только с правами — см. media.rightsStatus)
  images: { remotePatterns: [] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};
export default nextConfig;
