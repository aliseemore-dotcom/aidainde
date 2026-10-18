const isDev = process.env.NODE_ENV !== 'production';
const imageHosts = (process.env.IMAGE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean).map((h) => `https://${h}`);

// CSP: скрипты только свои (Next вставляет inline-загрузчик), шрифты — Google Fonts из дизайн-кита,
// картинки — свои и из IMAGE_HOSTS, формы и соединения — только на свой домен.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src 'self' data: ${imageHosts.join(' ')}`.trim(),
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

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
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default nextConfig;
