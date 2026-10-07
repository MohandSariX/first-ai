import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "./client.js";
import { organizations } from "./schema/index.js";

const expectedTables = [
  "agent_runs",
  "agent_tool_calls",
  "agents",
  "ai_settings",
  "approval_requests",
  "contacts",
  "credit_note_items",
  "credit_note_number_counters",
  "credit_notes",
  "customer_sites",
  "customers",
  "financial_archive_exports",
  "financial_artifacts",
  "financial_audit_events",
  "financial_retention_policies",
  "invoice_items",
  "invoice_number_counters",
  "invoices",
  "job_reports",
  "jobs",
  "leads",
  "organizations",
  "payments",
  "quote_items",
  "quotes",
  "services",
  "users",
];

const expectedEnums = [
  "agent_run_status",
  "agent_status",
  "agent_tool_call_status",
  "approval_status",
  "billing_classification",
  "credit_note_status",
  "customer_risk_level",
  "customer_status",
  "customer_type",
  "fiscal_territory",
  "infestation_level",
  "invoice_status",
  "invoice_transaction_type",
  "job_priority",
  "job_status",
  "lead_source",
  "lead_status",
  "legal_entity_type",
  "model_profile",
  "operation_category",
  "payment_method",
  "payment_status",
  "pricing_mode",
  "quote_status",
  "user_role",
  "vat_regime",
  "vat_treatment",
];

const expectedForeignKeys = [
  ["contacts", "customer_id", "customers", "id"],
  ["contacts", "organization_id", "organizations", "id"],
  ["customer_sites", "customer_id", "customers", "id"],
  ["customer_sites", "organization_id", "organizations", "id"],
  ["customer_sites", "primary_contact_id", "contacts", "id"],
  ["customers", "organization_id", "organizations", "id"],
  ["users", "organization_id", "organizations", "id"],
  ["leads", "organization_id", "organizations", "id"],
  ["leads", "assigned_user_id", "users", "id"],
  ["services", "organization_id", "organizations", "id"],
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
    ).toEqual(expect.arrayContaining(expectedForeignKeys));
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

  it("records all Drizzle migrations", async () => {
    const result = await database.execute<{ migrationCount: number }>(sql`
      select count(*)::integer as "migrationCount"
      from drizzle.__drizzle_migrations
    `);

    expect(result).toEqual([{ migrationCount: 22 }]);
  });

  it("enables RLS with the expected read policies", async () => {
    const tables = await database.execute<{
      tableName: string;
      rowSecurityEnabled: boolean;
    }>(sql`
      select relname as "tableName", relrowsecurity as "rowSecurityEnabled"
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and relname in ('organizations', 'users', 'customers', 'contacts', 'customer_sites', 'leads', 'services')
      order by relname
    `);
    expect(tables).toHaveLength(7);
    expect(tables.every((table) => table.rowSecurityEnabled)).toBe(true);

    const policies = await database.execute<{ policyName: string }>(sql`
      select policyname as "policyName"
      from pg_policies
      where schemaname = 'public'
        and tablename in ('organizations', 'users', 'customers', 'contacts', 'customer_sites', 'leads', 'services')
      order by policyname
    `);
    expect(policies.map((policy) => policy.policyName)).toEqual([
      "contacts_select_own_organization",
      "customer_sites_select_own_organization",
      "customers_select_own_organization",
      "leads_select_own_organization",
      "organizations_select_own",
      "services_select_own_organization",
      "users_select_own_organization",
    ]);
  });

  it("secures the tenant-resolution helper", async () => {
    const result = await database.execute<{
      isSecurityDefiner: boolean;
      configuration: string[];
      anonymousCanExecute: boolean;
      authenticatedCanExecute: boolean;
    }>(sql`
      select
        procedure_definition.prosecdef as "isSecurityDefiner",
        procedure_definition.proconfig as "configuration",
        has_function_privilege('anon', 'public.current_organization_id()', 'EXECUTE') as "anonymousCanExecute",
        has_function_privilege('authenticated', 'public.current_organization_id()', 'EXECUTE') as "authenticatedCanExecute"
      from pg_proc procedure_definition
      join pg_namespace procedure_namespace
        on procedure_namespace.oid = procedure_definition.pronamespace
      where procedure_namespace.nspname = 'public'
        and procedure_definition.proname = 'current_organization_id'
    `);

    expect(result).toEqual([
      {
        isSecurityDefiner: true,
        configuration: ["search_path=\"\""],
        anonymousCanExecute: false,
        authenticatedCanExecute: true,
      },
    ]);
  });
});
