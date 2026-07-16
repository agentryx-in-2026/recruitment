import { storage } from '../server/storage';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = storage.db;
  if (!db) {
    console.error("No DB connection");
    process.exit(1);
  }
  const allUsers = await db.select().from(users);
  console.log("All users:");
  allUsers.forEach((u: any) => console.log(u.id, u.username, u.email));

  const mobileTest = await db.select().from(users).where(eq(users.username, 'mobiletest@hirestream.dev'));
  console.log("Mobile test user:", mobileTest);
  process.exit(0);
}

main().catch(console.error);
