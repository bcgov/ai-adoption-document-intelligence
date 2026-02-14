const mockExec = jest.fn();

jest.mock("child_process", () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}));

jest.mock("util", () => ({
  ...jest.requireActual("util"),
  promisify: jest.fn((fn) => fn),
}));

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DvcService } from "./dvc.service";

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === "MINIO_ENDPOINT") return "http://localhost:9000";
    if (key === "MINIO_ACCESS_KEY") return "testkey";
    if (key === "MINIO_SECRET_KEY") return "testsecret";
    if (key === "DATASET_GIT_USERNAME") return "testuser";
    if (key === "DATASET_GIT_PASSWORD") return "testpass";
    return defaultValue;
  }),
};

describe("DvcService", () => {
  let service: DvcService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DvcService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DvcService>(DvcService);
  });

  // Helper to mock successful command execution
  const mockSuccessfulExec = (stdout = "", stderr = "") => {
    mockExec.mockResolvedValue({ stdout, stderr });
  };

  // Helper to mock failed command execution
  const mockFailedExec = (error: Error) => {
    mockExec.mockRejectedValue(error);
  };

  // -----------------------------------------------------------------------
  // Scenario 8: Clone dataset repository
  // -----------------------------------------------------------------------
  describe("cloneRepository", () => {
    it("clones a repository successfully", async () => {
      mockSuccessfulExec("", "Cloning into 'repo'...");

      await service.cloneRepository(
        "https://github.com/user/repo.git",
        "/tmp/repo",
      );

      expect(mockExec).toHaveBeenCalledWith(
        'git clone "https://testuser:testpass@github.com/user/repo.git" "/tmp/repo"',
      );
    });

    it("clones without credentials for SSH URLs", async () => {
      mockSuccessfulExec("", "Cloning into 'repo'...");

      await service.cloneRepository(
        "git@github.com:user/repo.git",
        "/tmp/repo",
      );

      expect(mockExec).toHaveBeenCalledWith(
        'git clone "git@github.com:user/repo.git" "/tmp/repo"',
      );
    });

    it("throws error when clone fails", async () => {
      mockFailedExec(new Error("Repository not found"));

      await expect(
        service.cloneRepository(
          "https://github.com/user/repo.git",
          "/tmp/repo",
        ),
      ).rejects.toThrow("Failed to clone repository");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Initialize a dataset repository with DVC
  // -----------------------------------------------------------------------
  describe("initRepository", () => {
    it("initializes DVC and configures MinIO remote", async () => {
      mockSuccessfulExec();

      await service.initRepository("/tmp/repo");

      expect(mockExec).toHaveBeenCalledWith(
        "dvc init",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "dvc remote add -d minio s3://datasets",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("handles already initialized DVC repository", async () => {
      const error = new Error("already exists");
      error.message = "already exists";
      mockFailedExec(error);

      await expect(service.initRepository("/tmp/repo")).resolves.not.toThrow();
    });

    it("throws error when initialization fails", async () => {
      mockFailedExec(new Error("Permission denied"));

      await expect(service.initRepository("/tmp/repo")).rejects.toThrow(
        "Failed to initialize DVC repository",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Configure DVC remote to MinIO
  // -----------------------------------------------------------------------
  describe("configureRemote", () => {
    it("configures DVC remote with MinIO settings", async () => {
      mockSuccessfulExec();

      await service.configureRemote("/tmp/repo", "minio", "s3://datasets");

      expect(mockExec).toHaveBeenCalledWith(
        "dvc remote add -d minio s3://datasets",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "dvc remote modify minio endpointurl http://localhost:9000",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "dvc remote modify minio access_key_id testkey",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "dvc remote modify minio secret_access_key testsecret",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("handles existing remote by modifying it", async () => {
      let callCount = 0;
      mockExec.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails (remote exists)
          const error = new Error("already exists");
          error.message = "already exists";
          return Promise.reject(error);
        }
        // Subsequent calls succeed
        return Promise.resolve({ stdout: "", stderr: "" });
      });

      await expect(
        service.configureRemote("/tmp/repo", "minio", "s3://datasets"),
      ).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Add files to DVC tracking
  // -----------------------------------------------------------------------
  describe("addFiles", () => {
    it("adds multiple files to DVC tracking", async () => {
      mockSuccessfulExec();

      await service.addFiles("/tmp/repo", ["data/file1.csv", "data/file2.csv"]);

      expect(mockExec).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenCalledWith(
        'dvc add "data/file1.csv"',
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        'dvc add "data/file2.csv"',
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("throws error when adding files fails", async () => {
      mockFailedExec(new Error("File not found"));

      await expect(
        service.addFiles("/tmp/repo", ["data/file1.csv"]),
      ).rejects.toThrow("Failed to add files to DVC");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Commit DVC metadata to Git
  // -----------------------------------------------------------------------
  describe("commitChanges", () => {
    it("commits changes and returns Git SHA", async () => {
      let callCount = 0;
      mockExec.mockImplementation(() => {
        callCount++;
        // Third call (git rev-parse HEAD) returns SHA
        const stdout = callCount === 3 ? "abc123def456\n" : "";
        return Promise.resolve({ stdout, stderr: "" });
      });

      const result = await service.commitChanges("/tmp/repo", "Add dataset v1");

      expect(result).toBe("abc123def456");
      expect(mockExec).toHaveBeenCalledWith(
        "git add *.dvc .gitignore manifest.json",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        'git commit -m "Add dataset v1"',
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "git rev-parse HEAD",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("throws error when commit fails", async () => {
      mockFailedExec(new Error("Nothing to commit"));

      await expect(
        service.commitChanges("/tmp/repo", "Add dataset v1"),
      ).rejects.toThrow("Failed to commit changes");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Push data to MinIO remote
  // -----------------------------------------------------------------------
  describe("pushData", () => {
    it("pushes DVC data to MinIO", async () => {
      mockSuccessfulExec();

      await service.pushData("/tmp/repo");

      expect(mockExec).toHaveBeenCalledWith(
        "dvc push",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("logs warning when stderr is present", async () => {
      const loggerWarnSpy = jest.spyOn(service["logger"], "warn");
      mockSuccessfulExec("", "Some warning");

      await service.pushData("/tmp/repo");

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("DVC push stderr"),
      );
    });

    it("throws error when push fails", async () => {
      mockFailedExec(new Error("Network error"));

      await expect(service.pushData("/tmp/repo")).rejects.toThrow(
        "Failed to push DVC data",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Checkout a specific Git revision
  // -----------------------------------------------------------------------
  describe("checkout", () => {
    it("checks out a specific Git revision", async () => {
      mockSuccessfulExec();

      await service.checkout("/tmp/repo", "abc123");

      expect(mockExec).toHaveBeenCalledWith(
        "git checkout abc123",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("throws error when checkout fails", async () => {
      mockFailedExec(new Error("Revision not found"));

      await expect(service.checkout("/tmp/repo", "abc123")).rejects.toThrow(
        "Failed to checkout revision abc123",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Pull data from MinIO remote at a specific revision
  // -----------------------------------------------------------------------
  describe("pullData", () => {
    it("checks out revision and pulls DVC data", async () => {
      mockSuccessfulExec();

      await service.pullData("/tmp/repo", "abc123");

      expect(mockExec).toHaveBeenCalledWith(
        "git checkout abc123",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "dvc pull",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("logs warning when stderr contains non-standard messages", async () => {
      let callCount = 0;
      mockExec.mockImplementation(() => {
        callCount++;
        // Second call (dvc pull) has stderr
        const stderr = callCount === 2 ? "Warning: something" : "";
        return Promise.resolve({ stdout: "", stderr });
      });

      const loggerWarnSpy = jest.spyOn(service["logger"], "warn");

      await service.pullData("/tmp/repo", "abc123");

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("DVC pull stderr"),
      );
    });

    it("throws error when pull fails", async () => {
      mockFailedExec(new Error("Network error"));

      await expect(service.pullData("/tmp/repo", "abc123")).rejects.toThrow(
        "Failed to pull DVC data",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Additional: Get current Git revision
  // -----------------------------------------------------------------------
  describe("getCurrentRevision", () => {
    it("returns current Git commit SHA", async () => {
      mockSuccessfulExec("abc123def456\n");

      const result = await service.getCurrentRevision("/tmp/repo");

      expect(result).toBe("abc123def456");
      expect(mockExec).toHaveBeenCalledWith(
        "git rev-parse HEAD",
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });

    it("throws error when getting revision fails", async () => {
      mockFailedExec(new Error("Not a git repository"));

      await expect(service.getCurrentRevision("/tmp/repo")).rejects.toThrow(
        "Failed to get current revision",
      );
    });
  });
});
