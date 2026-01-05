import { Logger } from "@nestjs/common";

beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});

  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "debug").mockImplementation(() => {});
});
