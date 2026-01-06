import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import TestAgent from "supertest/lib/agent";
import { TestAppModule } from "./test-app.module";

interface ITestModule {
  open: () => Promise<TestAgent>;
  close: () => Promise<void>;
}

const setupTestModule = (): ITestModule => {
  let app: INestApplication;

  const openTestApp = async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    const module = (request as unknown as Function)(app.getHttpServer());
    return module as TestAgent;
  };

  const closeTestApp = async () => {
    if (app) {
      await app.close();
    }
  };

  return { open: openTestApp, close: closeTestApp };
};

export default setupTestModule;
