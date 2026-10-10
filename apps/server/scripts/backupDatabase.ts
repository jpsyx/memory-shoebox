import { backupDatabase } from "../src/db/backupDatabase.ts";

const [sourcePath, destinationPath, ...extraArguments] = process.argv.slice(2);
try {
  if (!sourcePath || !destinationPath || extraArguments.length > 0) {
    throw new Error(
      "Usage: node apps/server/scripts/backupDatabase.ts SOURCE DESTINATION",
    );
  }
  await backupDatabase(sourcePath, destinationPath);
  console.log(`Verified database backup: ${destinationPath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
