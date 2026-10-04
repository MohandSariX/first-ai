import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "./client.js";
import { organizations } from "./schema/index.js";

const expectedTables = [
  "contacts",
  "customer_sites",
  "customers",
  "organizations",
  "users",
];

const expectedEnums = [
  "customer_risk_level",
  "customer_status",
  "customer_type",
  "user_role",
];

const expectedForeignKeys = [
  ["contacts", "customer_id", "customers", "id"],
  ["contacts", "organization_id", "organizations", "id"],
  ["customer_sites", "customer_id", "customers", "id"],
  ["customer_sites", "organization_id", "organizations", "id"],
  ["customer_sites", "primary_contact_id", "contacts", "id"],
  ["customers", "organization_id", "organizations", "id"],
  ["users", "organization_id", "organizations", "id"],
];

describe("local Supabase database schema", () => {
  const database = createDatabaseClient();

  beforeAll(async () => {
    await database.select({ id: organizations.id }).from(organizations).limit(1);
  });

  afterAll(async () => {
    await database.$client.end();
  });

  it("contains exactly the expected public application tables", async () => {
    const result = await database.execute<{ tableName: string }>(sql`
      select table_name as "tableName"
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `);

    expect(result.map((row) => row.tableName)).toEqual(expectedTables);
  });

  it("contains the expected foreign keys", async () => {
    const result = await database.execute<{
      tableName: string;
      columnName: string;
      foreignTableName: string;
      foreignColumnName: string;
    }>(sql`
      select
        source_table.relname as "tableName",
        source_column.attname as "columnName",
        target_table.relname as "foreignTableName",
        target_column.attname as "foreignColumnName"
      from pg_constraint constraint_definition
      join pg_class source_table
        on source_table.oid = constraint_definition.conrelid
      join pg_namespace source_namespace
        on source_namespace.oid = source_table.relnamespace
      join pg_class target_table
        on target_table.oid = constraint_definition.confrelid
      join lateral unnest(constraint_definition.conkey) with ordinality source_key(attnum, position)
        on true
      join lateral unnest(constraint_definition.confkey) with ordinality target_key(attnum, position)
        on target_key.position = source_key.position
      join pg_attribute source_column
        on source_column.attrelid = source_table.oid
        and source_column.attnum = source_key.attnum
      join pg_attribute target_column
        on target_column.attrelid = target_table.oid
        and target_column.attnum = target_key.attnum
      where constraint_definition.contype = 'f'
        and source_namespace.nspname = 'public'
      order by 1, 2
    `);

    expect(
      result.map((row) => [
        row.tableName,
        row.columnName,
        row.foreignTableName,
        row.foreignColumnName,
      ]),
    ).toEqual(expectedForeignKeys);
  });

  it("keeps the primary contact foreign key nullable", async () => {
    const result = await database.execute<{ isNullable: string }>(sql`
      select is_nullable as "isNullable"
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customer_sites'
        and column_name = 'primary_contact_id'
    `);

    expect(result).toEqual([{ isNullable: "YES" }]);
  });

  it("contains the expected PostgreSQL enums", async () => {
    const result = await database.execute<{ enumName: string }>(sql`
      select distinct type_definition.typname as "enumName"
      from pg_type type_definition
      join pg_enum enum_value on enum_value.enumtypid = type_definition.oid
      join pg_namespace type_namespace on type_namespace.oid = type_definition.typnamespace
      where type_namespace.nspname = 'public'
      order by 1
    `);

    expect(result.map((row) => row.enumName)).toEqual(expectedEnums);
  });

  it("records the single Drizzle migration", async () => {
    const result = await database.execute<{ migrationCount: number }>(sql`
      select count(*)::integer as "migrationCount"
      from drizzle.__drizzle_migrations
    `);

    expect(result).toEqual([{ migrationCount: 1 }]);
  });
});
