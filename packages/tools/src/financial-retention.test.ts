import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { hasPermission } from "@first-ai/auth";
import { financialRetentionDeadline, financialRetentionPolicySchema } from "@first-ai/schemas";
import { financialHash, financialStorageKey, LocalFinancialStorage } from "./financial-storage.js";
import { verifyFinancialArchive } from "./financial-archive.js";
describe("M5B retention and archive foundations", () => {
  it("uses accounting close rather than invoice anniversary, across year boundaries", () => {
    const p = { closingMonth: 6, closingDay: 30, retentionYears: 10 };
    expect(financialRetentionDeadline("2026-06-30", p)).toEqual({ accountingClose: "2026-06-30", retentionUntil: "2036-06-30" });
    expect(financialRetentionDeadline("2026-07-01", p)).toEqual({ accountingClose: "2027-06-30", retentionUntil: "2037-06-30" });
    expect(financialRetentionDeadline("2026-12-31", { ...p, closingMonth: 12, closingDay: 31 }).retentionUntil).toBe("2036-12-31");
    expect(financialRetentionDeadline("2027-01-01", { ...p, closingMonth: 12, closingDay: 31 }).retentionUntil).toBe("2037-12-31");
    expect(financialRetentionDeadline("2026-01-01", null)).toEqual({ accountingClose: null, retentionUntil: null });
  });
  it("rejects missing/invalid close, short retention and tenant injection", () => {
    for (const input of [{}, { closingMonth: 2, closingDay: 29, retentionYears: 10 }, { closingMonth: 4, closingDay: 31, retentionYears: 10 }, { closingMonth: 12, closingDay: 31, retentionYears: 9 }, { closingMonth: 12, closingDay: 31, retentionYears: 10, organizationId: randomUUID() }]) expect(financialRetentionPolicySchema.safeParse(input).success).toBe(false);
  });
  it("centralizes permissions", () => {
    for (const role of ["OWNER", "ADMIN"] as const) expect(hasPermission(role, "financialArchive.configure")).toBe(true);
    for (const role of ["ACCOUNTANT", "MANAGER", "READ_ONLY", "TECHNICIAN"] as const) expect(hasPermission(role, "financialArchive.configure")).toBe(false);
    expect(hasPermission("ACCOUNTANT", "financialArchive.export")).toBe(true); expect(hasPermission("MANAGER", "financialArchive.export")).toBe(false);
    for (const role of ["READ_ONLY", "TECHNICIAN"] as const) expect(hasPermission(role, "financialArchive.read")).toBe(false);
  });
  it("publishes immutable bytes, verifies hashes, rejects traversal/foreign keys and has no delete", async () => {
    const dir = await mkdtemp(join(tmpdir(), "first-ai-storage-unit-"));
    try {
      const storage = new LocalFinancialStorage(dir), org = randomUUID(), id = randomUUID(), bytes = Buffer.from("%PDF-fictional-original"), hash = financialHash(bytes), key = financialStorageKey(org, "invoice", id, hash);
      await Promise.all([storage.put(org,key,bytes),storage.put(org,key,bytes)]);
      expect(await storage.read(org,key,hash,bytes.length)).toEqual(bytes); expect(await readFile(join(dir,key))).toEqual(bytes);
      await expect(storage.put(org,key,Buffer.from("%PDF-altered-original"))).rejects.toThrow();
      await expect(storage.read(randomUUID(),key,hash,bytes.length)).rejects.toThrow();
      await expect(storage.put(org,`${org}/../../elsewhere`,bytes)).rejects.toThrow(); expect("delete" in storage).toBe(false);
      await writeFile(join(dir,key),Buffer.from("x".repeat(bytes.length))); await expect(storage.read(org,key,hash,bytes.length)).rejects.toThrow("Empreinte");
      const other = randomUUID(); await symlink(join(dir,org),join(dir,other)); await expect(storage.put(other,financialStorageKey(other,"invoice",id,hash),bytes)).rejects.toThrow();
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
  function bundle() { const org = randomUUID(), records = Buffer.from(JSON.stringify({version:1,organizationId:org,policy:null,documents:[],payments:[],auditEvents:[],counters:{}})); return {manifest:{version:1,organizationId:org,exportId:randomUUID(),createdAt:"2026-10-07T12:00:00Z",period:{from:"2026-01-01",to:"2026-12-31"},files:[{name:"records.json",sha256:financialHash(records),bytes:records.length}]},files:[{name:"records.json",base64:records.toString("base64")}]}; }
  it("verifies a bounded manifest offline without mutating input", () => { const b=bundle(), copy=structuredClone(b); expect(verifyFinancialArchive(b)).toEqual({valid:true,errors:[]}); expect(b).toEqual(copy); });
  it("detects missing/modified files, invalid versions and duplicates", () => {
    const missing=bundle(); missing.files=[]; expect(verifyFinancialArchive(missing).valid).toBe(false);
    const altered=bundle(); altered.files[0]!.base64=Buffer.from("corruption").toString("base64"); expect(verifyFinancialArchive(altered).valid).toBe(false);
    expect(verifyFinancialArchive({...bundle(),manifest:{...bundle().manifest,version:2}}).valid).toBe(false); expect(verifyFinancialArchive("malformed").valid).toBe(false);
    const duplicate=bundle(); duplicate.files.push(duplicate.files[0]!); expect(verifyFinancialArchive(duplicate).valid).toBe(false);
  });
});
