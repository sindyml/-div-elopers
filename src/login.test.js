import { describe, test, expect } from "vitest";
import { isValidPassword } from "./validation.js";

describe("isValidPassword", () => {
  test("valid password passes", () => {
    expect(isValidPassword("123456")).toBe(true);
  });

  test("empty string fails", () => {
    expect(isValidPassword("")).toBe(false);
  });

  test("null fails", () => {
    expect(isValidPassword(null)).toBe(false);
  });

  test("undefined fails", () => {
    expect(isValidPassword(undefined)).toBe(false);
  });

  test("spaces only fails", () => {
    expect(isValidPassword("   ")).toBe(false);
  });

  test("short password fails", () => {
    expect(isValidPassword("123")).toBe(false);
  });
});