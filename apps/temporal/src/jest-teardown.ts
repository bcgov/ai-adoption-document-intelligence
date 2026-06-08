/**
 * Jest setup file - registers a cleanup handler to close database connections.
 * This prevents the "Force exiting Jest" warning by properly cleaning up async resources.
 *
 * Note: This file is executed in the test environment context, not as a global teardown.
 */
import { afterAll } from "@jest/globals";
import { disconnectPrismaClient } from "./activities/database-client";

// Register cleanup handler that runs after all tests complete
afterAll(async () => {
  await disconnectPrismaClient();
});
