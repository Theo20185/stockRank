import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DEFAULT_SPAXX_RATE, useSpaxxRate } from "./spaxx-rate.js";

beforeEach(() => {
  localStorage.removeItem("stockrank.spaxxRate");
});

describe("useSpaxxRate", () => {
  it("returns the package default when nothing is stored", () => {
    const { result } = renderHook(() => useSpaxxRate());
    expect(result.current[0]).toBe(DEFAULT_SPAXX_RATE);
  });

  it("loads a previously persisted rate from localStorage", () => {
    localStorage.setItem("stockrank.spaxxRate", "0.05");
    const { result } = renderHook(() => useSpaxxRate());
    expect(result.current[0]).toBe(0.05);
  });

  it("writes back through to localStorage on update", () => {
    const { result } = renderHook(() => useSpaxxRate());
    act(() => result.current[1](0.042));
    expect(result.current[0]).toBe(0.042);
    expect(localStorage.getItem("stockrank.spaxxRate")).toBe("0.042");
  });

  it("ignores out-of-range setter values", () => {
    const { result } = renderHook(() => useSpaxxRate());
    act(() => result.current[1](-0.01));
    expect(result.current[0]).toBe(DEFAULT_SPAXX_RATE);
    act(() => result.current[1](1.5));
    expect(result.current[0]).toBe(DEFAULT_SPAXX_RATE);
  });

  it("falls back to default for malformed stored values", () => {
    localStorage.setItem("stockrank.spaxxRate", "garbage");
    const { result } = renderHook(() => useSpaxxRate());
    expect(result.current[0]).toBe(DEFAULT_SPAXX_RATE);
  });
});
