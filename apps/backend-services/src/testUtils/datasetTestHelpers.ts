/**
 * Test Utilities for Dataset/DVC Operations
 *
 * Provides helper functions for creating temporary dataset repositories
 * for use in e2e and integration tests.
 */

import { exec } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface TempDatasetRepo {
  path: string;
  url: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary dataset Git repository for testing.
 *
 * @param prefix Optional prefix for the temp directory name
 * @returns Object with repo path, file:// URL, and cleanup function
 *
 * @example
 * ```typescript
 * // In test setup
 * let repo: TempDatasetRepo;
 *
 * beforeAll(async () => {
 *   repo = await createTempDatasetRepo('test-dataset-');
 * });
 *
 * afterAll(async () => {
 *   await repo.cleanup();
 * });
 *
 * it('should create dataset with temp repo', async () => {
 *   const dataset = await createDataset({
 *     name: 'Test Dataset',
 *     repositoryUrl: repo.url
 *   });
 *   expect(dataset.repositoryUrl).toBe(repo.url);
 * });
 * ```
 */
export async function createTempDatasetRepo(
  prefix = "dataset-test-",
): Promise<TempDatasetRepo> {
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), prefix));

  try {
    // Initialize git repo
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.name "Test User"', { cwd: tempDir });
    await execAsync('git config user.email "test@example.com"', {
      cwd: tempDir,
    });

    // Create initial commit
    await execAsync('echo "# Test Dataset Repository" > README.md', {
      cwd: tempDir,
    });
    await execAsync("git add README.md", { cwd: tempDir });
    await execAsync('git commit -m "Initial commit"', { cwd: tempDir });

    // Return repo info with cleanup function
    return {
      path: tempDir,
      url: `file://${tempDir}`,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    // Clean up on error
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Create multiple temporary dataset repositories for testing.
 *
 * @param count Number of repositories to create
 * @param prefix Optional prefix for the temp directory names
 * @returns Array of TempDatasetRepo objects
 *
 * @example
 * ```typescript
 * const repos = await createMultipleTempDatasetRepos(3);
 * // Use repos[0].url, repos[1].url, repos[2].url...
 * // Cleanup all
 * await Promise.all(repos.map(r => r.cleanup()));
 * ```
 */
export async function createMultipleTempDatasetRepos(
  count: number,
  prefix = "dataset-test-",
): Promise<TempDatasetRepo[]> {
  const repos: TempDatasetRepo[] = [];

  for (let i = 0; i < count; i++) {
    const repo = await createTempDatasetRepo(`${prefix}${i}-`);
    repos.push(repo);
  }

  return repos;
}

/**
 * Cleanup multiple temporary dataset repositories.
 *
 * @param repos Array of TempDatasetRepo objects to clean up
 */
export async function cleanupTempRepos(
  repos: TempDatasetRepo[],
): Promise<void> {
  await Promise.all(repos.map((repo) => repo.cleanup()));
}
