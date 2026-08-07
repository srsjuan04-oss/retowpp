import { describe, expect, test } from "bun:test";
import { assertCanSendOutbound, isWithinServiceWindow } from "./window";

const NOW = new Date("2026-07-27T12:00:00Z");

describe("isWithinServiceWindow", () => {
  test("false si nunca hubo un mensaje entrante", () => {
    expect(isWithinServiceWindow(null, NOW)).toBe(false);
  });

  test("true justo dentro de las 24h", () => {
    const lastInbound = new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(isWithinServiceWindow(lastInbound, NOW)).toBe(true);
  });

  test("false pasadas las 24h", () => {
    const lastInbound = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(isWithinServiceWindow(lastInbound, NOW)).toBe(false);
  });
});

describe("assertCanSendOutbound", () => {
  test("las plantillas siempre están permitidas, dentro o fuera de ventana", () => {
    const result = assertCanSendOutbound({ kind: "template", lastInboundAt: null, now: NOW });
    expect(result.allowed).toBe(true);
  });

  test("los mensajes de sesión se bloquean fuera de la ventana de 24h", () => {
    const longAgo = new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const result = assertCanSendOutbound({ kind: "session", lastInboundAt: longAgo, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test("los mensajes de sesión se permiten dentro de la ventana de 24h", () => {
    const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const result = assertCanSendOutbound({ kind: "session", lastInboundAt: recent, now: NOW });
    expect(result.allowed).toBe(true);
  });
});
