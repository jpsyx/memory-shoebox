import { createDatabase } from "../../../src/db/client.ts";
import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";

const databasePath: string | undefined = process.argv[2];
if (databasePath === undefined) {
  throw new Error("Missing temporary catalog path");
}
const context: TestApp = await createTestApp({
  database: createDatabase(databasePath),
  emailService: "none",
  mailDomainReader: "none",
});
process.on("message", async (message) => {
  if (message === "start") {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/setup",
      payload: {
        admin: { displayName: "Rosa", email: "rosa@example.com" },
        shoebox: { name: "My Shoebox", timezone: "UTC" },
        public: { baseUrl: "https://photos.example.com" },
      },
    });
    process.send?.({
      kind: "result",
      statusCode: response.statusCode,
      error: response.json().error,
      hasCookie: response.headers["set-cookie"] !== undefined,
    });
  }
  if (message === "close") {
    await context.close();
    process.disconnect?.();
  }
});
process.send?.({ kind: "ready" });
