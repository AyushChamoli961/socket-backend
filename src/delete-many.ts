import { db } from "./lib/db";

async function deleteAllUsers() {
  try {
    const deleteUsers = await db.userResponse.deleteMany();
    console.log(`Deleted ${deleteUsers.count} users`);
  } catch (e) {
    console.error(e);
  } finally {
    await db.$disconnect();
  }
}

deleteAllUsers();
