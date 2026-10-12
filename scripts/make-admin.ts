/** npm run admin:make -- <supabase-user-uuid> [editor|admin] — выдать права редактора каталога. */
import { connectFromEnv } from './_db';
import { adminUsers } from '../src/db/schema';

const [userId, role = 'editor'] = process.argv.slice(2);
if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || !['editor', 'admin'].includes(role)) {
  console.error('Использование: npm run admin:make -- <uuid пользователя Supabase> [editor|admin]');
  process.exit(1);
}
const { db, close } = connectFromEnv();
await db.insert(adminUsers).values({ userId, role: role as 'editor' | 'admin' }).onConflictDoUpdate({ target: adminUsers.userId, set: { role: role as 'editor' | 'admin' } });
await close();
console.log(`Готово: ${userId} -> ${role}`);
