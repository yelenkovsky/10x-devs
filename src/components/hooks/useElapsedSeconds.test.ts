// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElapsedSeconds } from "@/components/hooks/useElapsedSeconds";

describe("useElapsedSeconds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 and starts no interval when startedAt is null", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { result } = renderHook(() => useElapsedSeconds(null));

    expect(result.current).toBe(0);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(0);
    setIntervalSpy.mockRestore();
  });

  it("ticks elapsed whole seconds from startedAt, not from a delay gate", () => {
    const startedAt = Date.now();
    const { result } = renderHook(() => useElapsedSeconds(startedAt));

    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(2);
  });

  it("stops ticking after startedAt is cleared", () => {
    const { result, rerender } = renderHook(
      ({ startedAt }: { startedAt: number | null }) => useElapsedSeconds(startedAt),
      { initialProps: { startedAt: Date.now() } },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    rerender({ startedAt: null });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(0);
  });
});
