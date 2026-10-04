const runId = process.env.E2E_TEST_RUN_ID;
if (runId === undefined) throw new Error("E2E_TEST_RUN_ID is required.");

export const e2eFixture = {
  email: `crm-ui-${runId}@example.test`,
  password: `Local-Crm-${runId}`,
  organizationName: `Organisation CRM Test ${runId}`,
  customerName: `Acme Hygiène Test ${runId}`,
};
