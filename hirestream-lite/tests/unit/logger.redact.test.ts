import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { logger as winstonLogger } from "../../server/config/logger.config";
import log from "../../lib/logger";

describe("logger wrapper redact", () => {
  let logSpy: any;

  beforeEach(() => {
    // Spy on the underlying winston instance
    logSpy = jest.spyOn(winstonLogger, "log").mockImplementation(() => winstonLogger);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("redacts sensitive fields like password and email", () => {
    log.info("Test log", { 
      password: "my-secret-password", 
      email: "test@example.com", 
      normalField: "hello" 
    });

    expect(logSpy).toHaveBeenCalled();
    const args = logSpy.mock.calls[0];
    const meta = args[2];
    
    expect(meta.password).toBe("<REDACTED>");
    expect(meta.email).toBe("<REDACTED>");
    expect(meta.normalField).toBe("hello");
  });

  it("redacts nested sensitive fields via typed wrapper", () => {
    log.requestEnd({
      requestId: "req-1",
      route: "/api/test",
      statusCode: 200,
      durationMs: 10,
      userRole: "candidate",
      payload: {
        accessToken: "abc1234",
        passportNumber: "Z12345"
      }
    } as any);

    expect(logSpy).toHaveBeenCalled();
    const args = logSpy.mock.calls[0];
    const meta = args[2];
    
    expect(meta.payload.accessToken).toBe("<REDACTED>");
    expect(meta.payload.passportNumber).toBe("<REDACTED>");
    expect(meta.requestId).toBe("req-1");
  });
});
