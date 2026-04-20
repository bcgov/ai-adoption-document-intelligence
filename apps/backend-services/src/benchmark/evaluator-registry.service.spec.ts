/**
 * Evaluator Registry Service Tests
 *
 * Tests for the evaluator registry service.
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 */

import { Test, TestingModule } from "@nestjs/testing";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

describe("EvaluatorRegistryService", () => {
  let service: EvaluatorRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvaluatorRegistryService],
    }).compile();

    service = module.get<EvaluatorRegistryService>(EvaluatorRegistryService);
  });

  describe("registerType", () => {
    it("registers an evaluator type", () => {
      service.registerType("schema-aware");

      expect(service.hasEvaluator("schema-aware")).toBe(true);
      expect(service.getCount()).toBe(1);
    });

    it("registers multiple evaluator types", () => {
      service.registerType("schema-aware");
      service.registerType("black-box");

      expect(service.hasEvaluator("schema-aware")).toBe(true);
      expect(service.hasEvaluator("black-box")).toBe(true);
      expect(service.getCount()).toBe(2);
    });

    it("skips duplicate registration with a warning", () => {
      const loggerWarnSpy = jest.spyOn(console, "warn");

      service.registerType("schema-aware");
      service.registerType("schema-aware");

      expect(loggerWarnSpy).toHaveBeenCalled();
      expect(service.getCount()).toBe(1);
    });

    it("throws error when type is empty", () => {
      expect(() => service.registerType("")).toThrow(
        "Evaluator type must be a non-empty string",
      );
    });
  });

  describe("getAvailableTypes", () => {
    it("returns empty array when no types are registered", () => {
      expect(service.getAvailableTypes()).toEqual([]);
    });

    it("returns array of registered evaluator types", () => {
      service.registerType("schema-aware");
      service.registerType("black-box");

      const types = service.getAvailableTypes();

      expect(types).toContain("schema-aware");
      expect(types).toContain("black-box");
      expect(types).toHaveLength(2);
    });

    it("returns types in sorted order", () => {
      service.registerType("custom-evaluator");
      service.registerType("black-box");
      service.registerType("schema-aware");

      const types = service.getAvailableTypes();

      expect(types).toEqual(["black-box", "custom-evaluator", "schema-aware"]);
    });
  });

  describe("hasEvaluator", () => {
    beforeEach(() => {
      service.registerType("schema-aware");
    });

    it("returns true for registered evaluator type", () => {
      expect(service.hasEvaluator("schema-aware")).toBe(true);
    });

    it("returns false for unregistered evaluator type", () => {
      expect(service.hasEvaluator("unknown-type")).toBe(false);
    });
  });

  describe("getCount", () => {
    it("returns 0 when no types are registered", () => {
      expect(service.getCount()).toBe(0);
    });

    it("returns correct count of registered types", () => {
      service.registerType("schema-aware");
      expect(service.getCount()).toBe(1);

      service.registerType("black-box");
      expect(service.getCount()).toBe(2);

      service.registerType("custom-evaluator");
      expect(service.getCount()).toBe(3);
    });

    it("does not increment count for duplicate registration", () => {
      service.registerType("schema-aware");
      service.registerType("schema-aware");

      expect(service.getCount()).toBe(1);
    });
  });
});
