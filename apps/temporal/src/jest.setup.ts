const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
};
const mockCreateActivityLogger = jest.fn(() => mockLog);

beforeEach(() => {
  mockLog.child.mockReturnValue(mockLog);
  mockCreateActivityLogger.mockImplementation(() => mockLog);
});

jest.mock("./metrics", () => ({
  getMetricsHook: () => undefined,
}));

jest.mock("./logger", () => ({
  workerLogger: mockLog,
  createActivityLogger: mockCreateActivityLogger,
}));
