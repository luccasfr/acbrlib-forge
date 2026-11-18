import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { decrypt, encrypt } from "../src/candidate.ts";

it("autentica o artefato e rejeita chaves incorretas e alterações", () => {
  const key = randomBytes(32);
  const archive = Buffer.from("artefato sintético");
  const encrypted = encrypt(archive, key);
  expect(decrypt(encrypted, key)).toEqual(archive);
  expect(encrypt(archive, key)).not.toEqual(encrypted);
  expect(() => decrypt(encrypted, randomBytes(32))).toThrow();
  encrypted[encrypted.length - 1] ^= 1;
  expect(() => decrypt(encrypted, key)).toThrow();
});
