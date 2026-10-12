import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'node_modules/**', 'design-kit/**', 'drizzle/**', 'test-results/**'] },
];

export default config;
