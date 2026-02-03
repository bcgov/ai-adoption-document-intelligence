import {
  type ValidationError,
  validateWorkflowConfig,
} from "./workflow-validator";

describe("workflow-validator", () => {
  describe("validateWorkflowConfig", () => {
    it("returns valid for empty config", () => {
      const result = validateWorkflowConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns valid for config with valid step IDs only", () => {
      const result = validateWorkflowConfig({
        prepareFileData: { enabled: true },
        pollOCRResults: { enabled: true },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns invalid for unknown step ID", () => {
      const result = validateWorkflowConfig({
        invalidStep: { enabled: true },
      } as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        stepId: "invalidStep",
        message: expect.stringContaining("Invalid step ID"),
      });
    });

    it("returns invalid when enabled is not a boolean", () => {
      const result = validateWorkflowConfig({
        prepareFileData: { enabled: "yes" as any },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        stepId: "prepareFileData",
        field: "enabled",
        message: "enabled must be a boolean",
      });
    });

    it("accepts enabled as boolean true or false", () => {
      expect(
        validateWorkflowConfig({ prepareFileData: { enabled: false } }).valid,
      ).toBe(true);
    });

    describe("pollOCRResults parameters", () => {
      it("returns invalid when maxRetries < 1", () => {
        const result = validateWorkflowConfig({
          pollOCRResults: {
            enabled: true,
            parameters: { maxRetries: 0 },
          },
        });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e: ValidationError) => e.field === "maxRetries"),
        ).toBe(true);
      });

      it("returns invalid when maxRetries > 100", () => {
        const result = validateWorkflowConfig({
          pollOCRResults: {
            enabled: true,
            parameters: { maxRetries: 101 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("returns invalid when waitBeforeFirstPoll < 0", () => {
        const result = validateWorkflowConfig({
          pollOCRResults: {
            enabled: true,
            parameters: { waitBeforeFirstPoll: -1 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("returns invalid when waitBetweenPolls < 0", () => {
        const result = validateWorkflowConfig({
          pollOCRResults: {
            enabled: true,
            parameters: { waitBetweenPolls: -1 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("accepts valid pollOCRResults parameters", () => {
        const result = validateWorkflowConfig({
          pollOCRResults: {
            enabled: true,
            parameters: {
              maxRetries: 5,
              waitBeforeFirstPoll: 1,
              waitBetweenPolls: 2,
            },
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("checkOcrConfidence parameters", () => {
      it("returns invalid when threshold < 0", () => {
        const result = validateWorkflowConfig({
          checkOcrConfidence: {
            enabled: true,
            parameters: { threshold: -0.1 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("returns invalid when threshold > 1", () => {
        const result = validateWorkflowConfig({
          checkOcrConfidence: {
            enabled: true,
            parameters: { threshold: 1.1 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("accepts valid threshold", () => {
        const result = validateWorkflowConfig({
          checkOcrConfidence: {
            enabled: true,
            parameters: { threshold: 0.8 },
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("humanReview parameters", () => {
      it("returns invalid when timeout < 0", () => {
        const result = validateWorkflowConfig({
          humanReview: {
            enabled: true,
            parameters: { timeout: -1 },
          },
        });
        expect(result.valid).toBe(false);
      });

      it("accepts valid timeout", () => {
        const result = validateWorkflowConfig({
          humanReview: {
            enabled: true,
            parameters: { timeout: 3600 },
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    it("skips step with null/undefined config", () => {
      const result = validateWorkflowConfig({
        prepareFileData: null,
      } as any);
      expect(result.valid).toBe(true);
    });
  });
});
