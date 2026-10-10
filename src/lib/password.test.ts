import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decoyHash, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.ok(await verifyPassword("correct horse battery staple", hash));
    assert.ok(!(await verifyPassword("correct horse battery stapl", hash)));
    assert.ok(!(await verifyPassword("", hash)));
  });

  it("salts every hash, so equal passwords never produce equal hashes", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    assert.notEqual(a, b);
    assert.ok(await verifyPassword("same password", a));
    assert.ok(await verifyPassword("same password", b));
  });

  it("never stores the password itself", async () => {
    assert.ok(!(await hashPassword("hunter2hunter2")).includes("hunter2"));
  });

  it("treats malformed stored hashes as a failed login instead of throwing", async () => {
    for (const stored of ["", "plain", "scrypt$", "scrypt$abc$def$ghi", "bcrypt$32768$aaaa$bbbb", "scrypt$99999999999$aaaa$bbbb"]) {
      assert.equal(await verifyPassword("anything", stored), false, stored);
    }
  });

  it("gives unicode passwords the same hash input however they are typed", async () => {
    const hash = await hashPassword("café-password"); // precomposed é
    assert.ok(await verifyPassword("café-password", hash)); // e + combining accent
  });

  it("offers a decoy hash that no password matches", async () => {
    assert.ok(!(await verifyPassword("password", await decoyHash())));
  });
});
