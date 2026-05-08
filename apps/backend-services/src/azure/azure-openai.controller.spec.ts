import type { ConfigService } from "@nestjs/config";
import { AzureOpenAiController } from "./azure-openai.controller";

describe("AzureOpenAiController", () => {
  function makeController(
    env: Record<string, string | undefined>,
  ): AzureOpenAiController {
    const configService = {
      get: <T>(key: string): T | undefined => env[key] as T | undefined,
    } as unknown as ConfigService;
    return new AzureOpenAiController(configService);
  }

  describe("getDeployments", () => {
    it("parses AZURE_OPENAI_DEPLOYMENTS as comma-separated list", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENTS: "gpt-4o,gpt-5",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual(["gpt-4o", "gpt-5"]);
    });

    it("trims whitespace and drops empty entries", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENTS: " gpt-4o , , gpt-5 , ",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual(["gpt-4o", "gpt-5"]);
    });

    it("falls back to AZURE_OPENAI_DEPLOYMENT when DEPLOYMENTS is unset", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENT: "gpt-4o",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual(["gpt-4o"]);
    });

    it("falls back to AZURE_OPENAI_DEPLOYMENT when DEPLOYMENTS is empty string", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENTS: "",
        AZURE_OPENAI_DEPLOYMENT: "gpt-4o",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual(["gpt-4o"]);
    });

    it("returns empty array when neither var is set", async () => {
      const controller = makeController({});
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual([]);
    });

    it("returns empty array when both vars are empty strings", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENTS: "",
        AZURE_OPENAI_DEPLOYMENT: "",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual([]);
    });

    it("preserves deployment order from the env var", async () => {
      const controller = makeController({
        AZURE_OPENAI_DEPLOYMENTS: "gpt-5,gpt-4o,gpt-4o-mini",
      });
      const result = await controller.getDeployments();
      expect(result.deployments).toEqual(["gpt-5", "gpt-4o", "gpt-4o-mini"]);
    });
  });
});
