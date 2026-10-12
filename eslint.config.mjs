import next from 'eslint-config-next';

export default [
  ...next,
  { ignores: ['.next/**', 'node_modules/**', 'design-kit/**', 'drizzle/**'] },
];
