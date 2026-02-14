/**
 * Evaluator Registry Service Tests
 *
 * Tests for the evaluator registry service.
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 */

import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { EvaluatorRegistryService } from "./evaluator-registry.service";
import {
  BenchmarkEvaluator,
  EvaluationInput,
  EvaluationResult,
} from "./evaluator.interface";

describe("EvaluatorRegistryService", () => {
  let service: EvaluatorRegistryService;

  // Mock evaluators
  const mockSchemaAwareEvaluator: BenchmarkEvaluator = {
    type: "schema-aware",
    evaluate: jest.fn(
      async (input: EvaluationInput): Promise<EvaluationResult> => {
        return {
          sampleId: input.sampleId,
          metrics: { accuracy: 0.95, precision: 0.92, recall: 0.90 },
          diagnostics: { fieldsCompared: 10, fieldsMatched: 9 },
          pass: true,
        };
      },
    ),
  };

  const mockBlackBoxEvaluator: BenchmarkEvaluator = {
    type: "black-box",
    evaluate: jest.fn(
      async (input: EvaluationInput): Promise<EvaluationResult> => {
        return {
          sampleId: input.sampleId,
          metrics: { similarity: 0.88 },
          diagnostics: { method: "deep-equal" },
          pass: true,
        };
      },
    ),
  };

  const mockCustomEvaluator: BenchmarkEvaluator = {
    type: "custom-evaluator",
    evaluate: jest.fn(
      async (input: EvaluationInput): Promise<EvaluationResult> => {
        return {
          sampleId: input.sampleId,
          metrics: { score: 0.75 },
          diagnostics: {},
          pass: false,
        };
      },
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvaluatorRegistryService],
    }).compile();

    service = module.get<EvaluatorRegistryService>(EvaluatorRegistryService);
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Register evaluators by type
  // -----------------------------------------------------------------------
  describe("register", () => {
    it("registers an evaluator by type", () => {
      service.register(mockSchemaAwareEvaluator);

      expect(service.hasEvaluator("schema-aware")).toBe(true);
      expect(service.getCount()).toBe(1);
    });

    it("registers multiple evaluators", () => {
      service.register(mockSchemaAwareEvaluator);
      service.register(mockBlackBoxEvaluator);

      expect(service.hasEvaluator("schema-aware")).toBe(true);
      expect(service.hasEvaluator("black-box")).toBe(true);
      expect(service.getCount()).toBe(2);
    });

    it("overwrites an existing evaluator with a warning", () => {
      const loggerWarnSpy = jest.spyOn(service["logger"], "warn");

      service.register(mockSchemaAwareEvaluator);
      service.register({
        ...mockSchemaAwareEvaluator,
        evaluate: jest.fn(),
      });

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Evaluator type "schema-aware" is already registered. Overwriting.',
      );
      expect(service.getCount()).toBe(1);
    });

    it("throws error when evaluator has no type", () => {
      const invalidEvaluator = {
        type: "",
        evaluate: jest.fn(),
      };

      expect(() => service.register(invalidEvaluator)).toThrow(
        "Evaluator must have a type string",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Resolve evaluators by type
  // -----------------------------------------------------------------------
  describe("getEvaluator", () => {
    beforeEach(() => {
      service.register(mockSchemaAwareEvaluator);
      service.register(mockBlackBoxEvaluator);
    });

    it("returns the correct evaluator for a registered type", () => {
      const evaluator = service.getEvaluator("schema-aware");

      expect(evaluator).toBe(mockSchemaAwareEvaluator);
      expect(evaluator.type).toBe("schema-aware");
    });

    it("returns different evaluators for different types", () => {
      const schemaAware = service.getEvaluator("schema-aware");
      const blackBox = service.getEvaluator("black-box");

      expect(schemaAware).toBe(mockSchemaAwareEvaluator);
      expect(blackBox).toBe(mockBlackBoxEvaluator);
      expect(schemaAware).not.toBe(blackBox);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Unknown evaluator type throws error
  // -----------------------------------------------------------------------
  describe("getEvaluator - error cases", () => {
    beforeEach(() => {
      service.register(mockSchemaAwareEvaluator);
      service.register(mockBlackBoxEvaluator);
    });

    it("throws NotFoundException for unregistered type", () => {
      expect(() => service.getEvaluator("unknown-type")).toThrow(
        NotFoundException,
      );
    });

    it("includes available types in error message", () => {
      expect(() => service.getEvaluator("unknown-type")).toThrow(
        'Evaluator type "unknown-type" is not registered. Available types: black-box, schema-aware',
      );
    });

    it("throws NotFoundException when no evaluators are registered", () => {
      const emptyService = new EvaluatorRegistryService();

      expect(() => emptyService.getEvaluator("any-type")).toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: List available evaluator types
  // -----------------------------------------------------------------------
  describe("getAvailableTypes", () => {
    it("returns empty array when no evaluators are registered", () => {
      expect(service.getAvailableTypes()).toEqual([]);
    });

    it("returns array of registered evaluator types", () => {
      service.register(mockSchemaAwareEvaluator);
      service.register(mockBlackBoxEvaluator);

      const types = service.getAvailableTypes();

      expect(types).toContain("schema-aware");
      expect(types).toContain("black-box");
      expect(types).toHaveLength(2);
    });

    it("returns types in sorted order", () => {
      service.register(mockCustomEvaluator);
      service.register(mockBlackBoxEvaluator);
      service.register(mockSchemaAwareEvaluator);

      const types = service.getAvailableTypes();

      expect(types).toEqual(["black-box", "custom-evaluator", "schema-aware"]);
    });
  });

  // -----------------------------------------------------------------------
  // Additional utility methods
  // -----------------------------------------------------------------------
  describe("hasEvaluator", () => {
    beforeEach(() => {
      service.register(mockSchemaAwareEvaluator);
    });

    it("returns true for registered evaluator type", () => {
      expect(service.hasEvaluator("schema-aware")).toBe(true);
    });

    it("returns false for unregistered evaluator type", () => {
      expect(service.hasEvaluator("unknown-type")).toBe(false);
    });
  });

  describe("getCount", () => {
    it("returns 0 when no evaluators are registered", () => {
      expect(service.getCount()).toBe(0);
    });

    it("returns correct count of registered evaluators", () => {
      service.register(mockSchemaAwareEvaluator);
      expect(service.getCount()).toBe(1);

      service.register(mockBlackBoxEvaluator);
      expect(service.getCount()).toBe(2);

      service.register(mockCustomEvaluator);
      expect(service.getCount()).toBe(3);
    });

    it("does not increment count when overwriting evaluator", () => {
      service.register(mockSchemaAwareEvaluator);
      service.register({
        ...mockSchemaAwareEvaluator,
        evaluate: jest.fn(),
      });

      expect(service.getCount()).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Integration test: Evaluator execution
  // -----------------------------------------------------------------------
  describe("evaluator execution", () => {
    beforeEach(() => {
      service.register(mockSchemaAwareEvaluator);
    });

    it("executes evaluator and returns result", async () => {
      const evaluator = service.getEvaluator("schema-aware");

      const input: EvaluationInput = {
        sampleId: "sample-001",
        inputPaths: ["/path/to/input.jpg"],
        predictionPaths: ["/path/to/prediction.json"],
        groundTruthPaths: ["/path/to/ground-truth.json"],
        metadata: { docType: "invoice" },
        evaluatorConfig: { threshold: 0.9 },
      };

      const result = await evaluator.evaluate(input);

      expect(result.sampleId).toBe("sample-001");
      expect(result.metrics).toBeDefined();
      expect(result.metrics.accuracy).toBe(0.95);
      expect(result.diagnostics).toBeDefined();
      expect(result.pass).toBe(true);
    });
  });
});
