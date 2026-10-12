/** npm run content:check — перед запуском на боевом домене. Код выхода 1, если есть проблемы. */
import { connectFromEnv } from './_db';
import { launchProblems } from '../src/features/catalog/launch-check';

const { db, close } = connectFromEnv();
const problems = await launchProblems(db);
await close();
if (!problems.length) { console.log('✓ Каталог готов к запуску'); process.exit(0); }
for (const p of problems) console.error(`✗ [${p.code}] ${p.message}`);
process.exit(1);
