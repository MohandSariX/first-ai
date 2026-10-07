// Node-only adapter. Keys are constructed by trusted services, never supplied by a browser.
import { constants } from "node:fs";
import { mkdir, realpath, open, link, unlink } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { OperationalConflictError } from "./operational-policies.js";
export const financialHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export interface FinancialArtifactStorage {
  put(organizationId: string, key: string, bytes: Buffer): Promise<void>;
  read(organizationId: string, key: string, hash: string, size: number): Promise<Buffer>;
}
const keySchema = z.string().regex(/^[0-9a-f-]{36}\/(invoice|credit_note|export)\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(pdf|json)$/);
export function financialStorageKey(org: string, kind: "invoice" | "credit_note" | "export", id: string, hash: string) {
  z.uuid().parse(org); z.uuid().parse(id); z.string().regex(/^[0-9a-f]{64}$/).parse(hash);
  return `${org}/${kind}/${id}/${hash}.${kind === "export" ? "json" : "pdf"}`;
}
export class LocalFinancialStorage implements FinancialArtifactStorage {
  private readonly root: string;
  constructor(directory = process.env.FINANCIAL_STORAGE_DIRECTORY || resolve(process.cwd(), ".financial-storage")) {
    if (typeof window !== "undefined") throw new Error("Financial storage is server-only.");
    this.root = resolve(directory);
  }
  private async path(org: string, key: string) {
    z.uuid().parse(org); keySchema.parse(key);
    if (key.split("/")[0] !== org) throw new OperationalConflictError("Archive inaccessible.");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await realpath(this.root), target = resolve(root, key);
    let directory = root;
    for (const segment of key.split("/").slice(0, -1)) {
      directory = resolve(directory, segment);
      await mkdir(directory, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; });
      if (await realpath(directory) !== directory) throw new OperationalConflictError("Chemin d’archive invalide.");
    }
    // Reject symlinked tenant/object directories. OS owner remains a documented trust boundary.
    if (await realpath(dirname(target)) !== dirname(target) || !target.startsWith(root + sep)) throw new OperationalConflictError("Chemin d’archive invalide.");
    return target;
  }
  async read(org: string, key: string, hash: string, size: number) {
    const path = await this.path(org, key);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== size || size > 100 * 1024 * 1024) throw new OperationalConflictError("Archive altérée ou trop volumineuse.");
      const bytes = await file.readFile();
      if (financialHash(bytes) !== hash) {
        console.error(JSON.stringify({ event: "financial_artifact_integrity_failed", organizationId: org, expectedSha256: hash }));
        throw new OperationalConflictError("Empreinte d’archive incohérente.");
      }
      return bytes;
    } finally { await file.close(); }
  }
  async put(org: string, key: string, bytes: Buffer) {
    if (bytes.length < 1 || bytes.length > 100 * 1024 * 1024 || !key.includes(financialHash(bytes))) throw new OperationalConflictError("Artefact invalide.");
    const path = await this.path(org, key), temporary = `${path}.${randomUUID()}.pending`;
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try {
      try { await link(temporary, path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      await this.read(org, key, financialHash(bytes), bytes.length);
    } finally { await unlink(temporary); }
  }
  // No purge capability, even after expiry. A future audited purge workflow is separate.
}
