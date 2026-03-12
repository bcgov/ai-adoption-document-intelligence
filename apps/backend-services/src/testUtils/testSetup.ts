class MockLogger {
  error() {}
  warn() {}
  log() {}
  debug() {}
  static overrideLogger() {}
}
// Suppress Logger Messages
jest.mock("@nestjs/common", () => ({
  ...jest.requireActual("@nestjs/common"),
  Logger: MockLogger,
}));
