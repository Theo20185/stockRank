import { describe, it, expect, vi } from "vitest";
import { retryYahoo } from "./retry.js";

describe("retryYahoo", () => {
  it("returns the value on first success without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => "ok");
    const result = await retryYahoo(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on thrown error and returns the next success", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return "ok";
    });
    const sleep = vi.fn(async () => {});
    const result = await retryYahoo(fn, { sleep, baseMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("uses exponential backoff: 250, 500, 1000 by default", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always fails");
    });
    const sleep = vi.fn(async () => {});
    await expect(retryYahoo(fn, { sleep })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([250, 500, 1000]);
  });

  it("throws the LAST error after maxAttempts is exhausted", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      throw new Error(`fail-${n}`);
    });
    const sleep = vi.fn(async () => {});
    await expect(
      retryYahoo(fn, { sleep, maxAttempts: 3, baseMs: 1 }),
    ).rejects.toThrow("fail-3");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("respects custom maxAttempts (1 = no retry)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("once");
    });
    const sleep = vi.fn(async () => {});
    await expect(
      retryYahoo(fn, { sleep, maxAttempts: 1 }),
    ).rejects.toThrow("once");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("invokes onRetry with attempt number and error for each retried attempt", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error(`bad-${calls}`);
      return "ok";
    });
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();
    await retryYahoo(fn, { sleep, baseMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toBe(1);
    expect((onRetry.mock.calls[0]![1] as Error).message).toBe("bad-1");
    expect(onRetry.mock.calls[1]![0]).toBe(2);
    expect((onRetry.mock.calls[1]![1] as Error).message).toBe("bad-2");
  });

  it("does not call onRetry on the first successful attempt", async () => {
    const onRetry = vi.fn();
    await retryYahoo(async () => "ok", {
      sleep: async () => {},
      onRetry,
    });
    expect(onRetry).not.toHaveBeenCalled();
  });
});
