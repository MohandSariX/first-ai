import { and, desc, eq, isNull } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import { approvalRequests, users, organizations } from "../schema/index.js";
import { RepositorySession, type OperationalStoreInterface } from "./operations.js";

export type Approval = typeof approvalRequests.$inferSelect;
export type ApprovalInsert = typeof approvalRequests.$inferInsert;
type Identity = { authUserId: string; userId: string; organizationId: string };
type Membership = Pick<typeof users.$inferSelect, "id" | "authUserId" | "organizationId" | "role">;
export interface ApprovalSession {
  get(id: string, identity: Identity): Promise<Approval | undefined>;
  membership(identity: Identity): Promise<Membership | undefined>;
  update(id: string, identity: Identity, changes: Partial<Pick<Approval, "status" | "resolvedAt" | "resolvedByUserId" | "result" | "errorCode">>): Promise<Approval>;
  operations: OperationalStoreInterface;
}
export interface ApprovalStore {
  create(input: ApprovalInsert): Promise<Approval>;
  list(identity: Identity): Promise<Approval[]>;
  transaction<T>(operation: (session: ApprovalSession) => Promise<T>): Promise<T>;
}
const scope = (id: string, i: Identity) => and(eq(approvalRequests.id, id), eq(approvalRequests.organizationId, i.organizationId), eq(approvalRequests.requestedByUserId, i.userId));
export class ApprovalRepository implements ApprovalStore {
  constructor(private readonly db: ReturnType<typeof createDatabaseClient>) {}
  async create(input: ApprovalInsert) { const [r] = await this.db.insert(approvalRequests).values(input).returning(); if (!r) throw new Error("Proposal persistence failed."); return r; }
  async list(i: Identity) { return this.db.select().from(approvalRequests).where(and(eq(approvalRequests.organizationId, i.organizationId), eq(approvalRequests.requestedByUserId, i.userId))).orderBy(desc(approvalRequests.createdAt)).limit(20); }
  async transaction<T>(operation: (session: ApprovalSession) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      const repositories = new RepositorySession(tx, true);
      // Existing service transactions become savepoints. Failed mutations roll back
      // without losing the outer proposal lock or its failure receipt.
      const operations: OperationalStoreInterface = Object.assign(repositories, { transaction: <R>(run: (s: RepositorySession) => Promise<R>) => tx.transaction(savepoint => run(new RepositorySession(savepoint, true))) });
      return operation({ operations,
        get: async (id, i) => (await tx.select().from(approvalRequests).where(scope(id, i)).limit(1).for("update"))[0],
        membership: async i => {
          // Serialize with organization suspension and role/membership changes.
          const [org] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, i.organizationId), eq(organizations.status, "active"), isNull(organizations.deletedAt))).for("update");
          if (!org) return undefined;
          return (await tx.select({ id: users.id, authUserId: users.authUserId, organizationId: users.organizationId, role: users.role }).from(users).where(and(eq(users.id, i.userId), eq(users.organizationId, i.organizationId), eq(users.authUserId, i.authUserId), eq(users.status, "active"), isNull(users.deletedAt))).limit(1).for("update"))[0];
        },
        update: async (id, i, changes) => { const [r] = await tx.update(approvalRequests).set({ ...changes, updatedAt: new Date() }).where(scope(id, i)).returning(); if (!r) throw new Error("Proposal not found."); return r; },
      });
    });
  }
}
