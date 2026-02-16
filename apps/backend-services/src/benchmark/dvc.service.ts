/**
 * DVC Service
 *
 * Automates DVC (Data Version Control) operations on dataset Git repositories.
 * Provides methods to initialize repositories, track files, commit changes,
 * push/pull data to/from MinIO, and checkout specific revisions.
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 3
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { exec } from "child_process";
import { promisify } from "util";
import { homedir } from "os";

const execAsync = promisify(exec);

@Injectable()
export class DvcService {
  private readonly logger = new Logger(DvcService.name);
  private readonly minioEndpoint: string;
  private readonly minioAccessKey: string;
  private readonly minioSecretKey: string;
  private readonly gitUsername?: string;
  private readonly gitPassword?: string;

  constructor(private configService: ConfigService) {
    this.minioEndpoint = this.configService.get<string>(
      "MINIO_ENDPOINT",
      "http://localhost:9000",
    );
    this.minioAccessKey = this.configService.get<string>(
      "MINIO_ACCESS_KEY",
      "minioadmin",
    );
    this.minioSecretKey = this.configService.get<string>(
      "MINIO_SECRET_KEY",
      "minioadmin",
    );
    this.gitUsername = this.configService.get<string>("DATASET_GIT_USERNAME");
    this.gitPassword = this.configService.get<string>("DATASET_GIT_PASSWORD");

    this.logger.log("DVC service initialized");
  }

  /**
   * Expand tilde (~) in file:// URLs to the user's home directory.
   * Also handles paths that start with ~ directly.
   */
  private expandTildePath(path: string): string {
    // Handle file:// URLs
    if (path.startsWith("file://")) {
      const filePath = path.slice(7); // Remove "file://"
      if (filePath.startsWith("~/") || filePath === "~") {
        const expandedPath = filePath.replace(/^~/, homedir());
        return `file://${expandedPath}`;
      }
      return path;
    }

    // Handle direct paths starting with ~
    if (path.startsWith("~/") || path === "~") {
      return path.replace(/^~/, homedir());
    }

    return path;
  }

  /**
   * Clone a dataset Git repository.
   */
  async cloneRepository(
    repositoryUrl: string,
    targetPath: string,
  ): Promise<void> {
    try {
      // Expand tilde in repository URL if present
      const expandedUrl = this.expandTildePath(repositoryUrl);

      // If credentials are provided, inject them into the URL
      let cloneUrl = expandedUrl;
      if (
        this.gitUsername &&
        this.gitPassword &&
        expandedUrl.startsWith("http")
      ) {
        const url = new URL(expandedUrl);
        url.username = this.gitUsername;
        url.password = this.gitPassword;
        cloneUrl = url.toString();
      }

      const { stdout, stderr } = await execAsync(
        `git clone "${cloneUrl}" "${targetPath}"`,
      );

      if (stderr && !stderr.includes("Cloning into")) {
        this.logger.warn(`Git clone stderr: ${stderr}`);
      }

      this.logger.log(`Cloned repository: ${repositoryUrl} to ${targetPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to clone repository ${repositoryUrl}`,
        error.stack,
      );
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Initialize DVC in a repository and configure MinIO remote.
   */
  async initRepository(repoPath: string): Promise<void> {
    try {
      // Initialize DVC
      await execAsync("dvc init", { cwd: repoPath });
      this.logger.debug(`DVC initialized in ${repoPath}`);

      // Configure DVC remote to use MinIO
      const remoteName = "minio";
      const bucketUrl = `s3://datasets`;

      await this.configureRemote(repoPath, remoteName, bucketUrl);

      // Commit DVC initialization files
      await execAsync(
        'git add .dvc .dvcignore && git commit -m "Initialize DVC"',
        {
          cwd: repoPath,
        },
      );

      this.logger.log(`DVC repository initialized at ${repoPath}`);
    } catch (error) {
      // If DVC is already initialized, that's okay
      if (error.message?.includes("already exists")) {
        this.logger.debug(`DVC already initialized in ${repoPath}`);
        return;
      }

      this.logger.error(`Failed to initialize DVC in ${repoPath}`, error.stack);
      throw new Error(`Failed to initialize DVC repository: ${error.message}`);
    }
  }

  /**
   * Configure DVC remote to use MinIO.
   */
  async configureRemote(
    repoPath: string,
    remoteName: string,
    bucketUrl: string,
  ): Promise<void> {
    try {
      // Add remote
      await execAsync(`dvc remote add -d ${remoteName} ${bucketUrl}`, {
        cwd: repoPath,
      });

      // Configure S3 endpoint for MinIO
      await execAsync(
        `dvc remote modify ${remoteName} endpointurl ${this.minioEndpoint}`,
        { cwd: repoPath },
      );

      // Set access key
      await execAsync(
        `dvc remote modify ${remoteName} access_key_id ${this.minioAccessKey}`,
        { cwd: repoPath },
      );

      // Set secret key
      await execAsync(
        `dvc remote modify ${remoteName} secret_access_key ${this.minioSecretKey}`,
        { cwd: repoPath },
      );

      this.logger.debug(`Configured DVC remote ${remoteName} for ${repoPath}`);
    } catch (error) {
      // If remote already exists, modify it instead
      if (error.message?.includes("already exists")) {
        await execAsync(`dvc remote modify ${remoteName} url ${bucketUrl}`, {
          cwd: repoPath,
        });
        this.logger.debug(`Updated existing DVC remote ${remoteName}`);
        return;
      }

      this.logger.error(
        `Failed to configure DVC remote ${remoteName}`,
        error.stack,
      );
      throw new Error(`Failed to configure DVC remote: ${error.message}`);
    }
  }

  /**
   * Add files to DVC tracking.
   */
  async addFiles(repoPath: string, filePaths: string[]): Promise<void> {
    try {
      for (const filePath of filePaths) {
        await execAsync(`dvc add "${filePath}"`, { cwd: repoPath });
        this.logger.debug(`Added ${filePath} to DVC tracking`);
      }

      this.logger.log(
        `Added ${filePaths.length} file(s) to DVC tracking in ${repoPath}`,
      );
    } catch (error) {
      this.logger.error(`Failed to add files to DVC`, error.stack);
      throw new Error(`Failed to add files to DVC: ${error.message}`);
    }
  }

  /**
   * Commit DVC metadata and manifest to Git.
   */
  async commitChanges(repoPath: string, message: string): Promise<string> {
    try {
      // Stage all .dvc files, .gitignore changes, and manifest
      await execAsync("git add *.dvc .gitignore manifest.json", {
        cwd: repoPath,
      });

      // Commit the changes
      await execAsync(`git commit -m "${message}"`, { cwd: repoPath });

      // Get the commit SHA
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: repoPath,
      });
      const commitSha = stdout.trim();

      this.logger.log(`Committed changes in ${repoPath}: ${commitSha}`);
      return commitSha;
    } catch (error) {
      this.logger.error(`Failed to commit changes in ${repoPath}`, error.stack);
      throw new Error(`Failed to commit changes: ${error.message}`);
    }
  }

  /**
   * Push DVC-tracked data to MinIO remote.
   */
  async pushData(repoPath: string): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync("dvc push", { cwd: repoPath });

      if (stderr) {
        this.logger.warn(`DVC push stderr: ${stderr}`);
      }

      this.logger.log(`Pushed DVC data from ${repoPath} to MinIO`);
    } catch (error) {
      this.logger.error(
        `Failed to push DVC data from ${repoPath}`,
        error.stack,
      );
      throw new Error(`Failed to push DVC data: ${error.message}`);
    }
  }

  /**
   * Checkout a specific Git revision.
   */
  async checkout(repoPath: string, gitRevision: string): Promise<void> {
    try {
      await execAsync(`git checkout ${gitRevision}`, { cwd: repoPath });

      this.logger.log(`Checked out revision ${gitRevision} in ${repoPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to checkout revision ${gitRevision} in ${repoPath}`,
        error.stack,
      );
      throw new Error(
        `Failed to checkout revision ${gitRevision}: ${error.message}`,
      );
    }
  }

  /**
   * Pull DVC-tracked data from MinIO remote at a specific Git revision.
   */
  async pullData(repoPath: string, gitRevision: string): Promise<void> {
    try {
      // Checkout the specific revision first
      await this.checkout(repoPath, gitRevision);

      // Pull DVC data for this revision
      const { stdout, stderr } = await execAsync("dvc pull", { cwd: repoPath });

      if (stderr && !stderr.includes("files downloaded")) {
        this.logger.warn(`DVC pull stderr: ${stderr}`);
      }

      this.logger.log(
        `Pulled DVC data for revision ${gitRevision} in ${repoPath}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to pull DVC data for revision ${gitRevision} in ${repoPath}`,
        error.stack,
      );
      throw new Error(`Failed to pull DVC data: ${error.message}`);
    }
  }

  /**
   * Get current Git revision (commit SHA).
   */
  async getCurrentRevision(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: repoPath,
      });
      return stdout.trim();
    } catch (error) {
      this.logger.error(
        `Failed to get current revision in ${repoPath}`,
        error.stack,
      );
      throw new Error(`Failed to get current revision: ${error.message}`);
    }
  }
}
