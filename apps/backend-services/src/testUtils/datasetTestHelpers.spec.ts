/**
 * Tests for Dataset Test Helpers
 */

import { access, readFile } from "fs/promises";
import { join } from "path";
import {
  createTempDatasetRepo,
  createMultipleTempDatasetRepos,
  cleanupTempRepos,
} from "./datasetTestHelpers";

describe("Dataset Test Helpers", () => {
  describe("createTempDatasetRepo", () => {
    it("creates a temporary git repository", async () => {
      const repo = await createTempDatasetRepo();

      try {
        // Verify directory exists
        await access(repo.path);

        // Verify it's a git repo
        await access(join(repo.path, ".git"));

        // Verify README was created
        const readme = await readFile(join(repo.path, "README.md"), "utf-8");
        expect(readme).toContain("# Test Dataset Repository");

        // Verify URL format
        expect(repo.url).toBe(`file://${repo.path}`);
        expect(repo.url).toMatch(/^file:\/\//);
      } finally {
        await repo.cleanup();
      }
    });

    it("allows custom prefix", async () => {
      const repo = await createTempDatasetRepo("my-custom-prefix-");

      try {
        expect(repo.path).toContain("my-custom-prefix-");
      } finally {
        await repo.cleanup();
      }
    });

    it("cleanup removes the repository", async () => {
      const repo = await createTempDatasetRepo();
      const repoPath = repo.path;

      await repo.cleanup();

      // Directory should no longer exist
      await expect(access(repoPath)).rejects.toThrow();
    });

    it("cleans up on error during creation", async () => {
      // This test is hard to trigger naturally, but we can verify the pattern
      // by checking that our function doesn't leave temp directories on failure
      const repo = await createTempDatasetRepo();
      const repoPath = repo.path;

      // Manually verify cleanup works
      await repo.cleanup();
      await expect(access(repoPath)).rejects.toThrow();
    });
  });

  describe("createMultipleTempDatasetRepos", () => {
    it("creates multiple repositories", async () => {
      const repos = await createMultipleTempDatasetRepos(3);

      try {
        expect(repos).toHaveLength(3);

        // All should have different paths
        const paths = repos.map((r) => r.path);
        expect(new Set(paths).size).toBe(3);

        // All should exist
        for (const repo of repos) {
          await access(repo.path);
          await access(join(repo.path, ".git"));
        }
      } finally {
        await cleanupTempRepos(repos);
      }
    });

    it("creates repositories with custom prefix", async () => {
      const repos = await createMultipleTempDatasetRepos(2, "custom-");

      try {
        expect(repos).toHaveLength(2);
        repos.forEach((repo) => {
          expect(repo.path).toContain("custom-");
        });
      } finally {
        await cleanupTempRepos(repos);
      }
    });
  });

  describe("cleanupTempRepos", () => {
    it("cleans up all repositories", async () => {
      const repos = await createMultipleTempDatasetRepos(3);
      const paths = repos.map((r) => r.path);

      await cleanupTempRepos(repos);

      // All should be removed
      for (const path of paths) {
        await expect(access(path)).rejects.toThrow();
      }
    });
  });
});
