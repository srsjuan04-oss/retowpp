import { describe, expect, test } from "bun:test";
import { isForwardStatusTransition } from "./message-status";

describe("isForwardStatusTransition", () => {
  test("permite el avance normal queued -> sent -> delivered -> read", () => {
    expect(isForwardStatusTransition("queued", "sent")).toBe(true);
    expect(isForwardStatusTransition("sent", "delivered")).toBe(true);
    expect(isForwardStatusTransition("delivered", "read")).toBe(true);
  });

  test("rechaza un evento de estado tardío que haría retroceder (read -> sent)", () => {
    expect(isForwardStatusTransition("read", "sent")).toBe(false);
    expect(isForwardStatusTransition("delivered", "sent")).toBe(false);
  });

  test("rechaza reprocesar el mismo estado (no hay avance)", () => {
    expect(isForwardStatusTransition("delivered", "delivered")).toBe(false);
  });

  test("failed se acepta desde cualquier estado previo", () => {
    expect(isForwardStatusTransition("queued", "failed")).toBe(true);
    expect(isForwardStatusTransition("read", "failed")).toBe(true);
  });

  test("failed es terminal: nada lo revierte", () => {
    expect(isForwardStatusTransition("failed", "sent")).toBe(false);
    expect(isForwardStatusTransition("failed", "delivered")).toBe(false);
  });
});
