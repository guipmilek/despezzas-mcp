#!/usr/bin/env node
import "dotenv/config";
import { DespezzasClient } from "../dist/client.js";
import { currentMonthRange } from "../dist/dates.js";

const client = new DespezzasClient();
const range = currentMonthRange();

function profileName(context) {
  if (!context || typeof context !== "object") return undefined;
  const activeId = context.current_profile_access_id ?? null;
  return {
    current_profile_access_id: activeId,
    current_profile_role: context.current_profile_role ?? null,
  };
}

async function main() {
  const auth = await client.authStatus();
  if (!auth.hasManualToken && !auth.hasEnvCredentials && !auth.hasSession) {
    throw new Error("No Despezzas auth configured. Login locally or configure env credentials before smoke testing.");
  }

  const [profile, access, accounts, cards, categories, subcategories, transactions, exportableCount] = await Promise.all([
    client.getProfile(),
    client.listProfileAccess(),
    client.getAccounts(),
    client.getCreditCards(),
    client.getCategories(true),
    client.getSubcategories(true),
    client.getTransactions({
      account_type: "bank_account",
      date_start: range.date_start,
      date_end: range.date_end,
      order_by: "date",
      order: "desc",
    }),
    client.countExportableTransactions({
      date_start: range.date_start,
      date_end: range.date_end,
    }),
  ]);

  const output = {
    ok: true,
    checked_at: new Date().toISOString(),
    auth: {
      has_manual_token: auth.hasManualToken,
      has_env_credentials: auth.hasEnvCredentials,
      has_session: auth.hasSession,
      can_refresh: auth.canRefresh,
      expires_at: auth.expiresAt,
    },
    active_profile: profileName(profile),
    profile_access: {
      owner_profiles: Array.isArray(access.owner_profiles) ? access.owner_profiles.length : null,
      member_profiles: Array.isArray(access.member_profiles) ? access.member_profiles.length : null,
    },
    counts: {
      accounts: accounts.length,
      credit_cards: cards.length,
      categories_default: Array.isArray(categories.defaults) ? categories.defaults.length : null,
      categories_user: Array.isArray(categories.user) ? categories.user.length : null,
      subcategories_default: Array.isArray(subcategories.defaults) ? subcategories.defaults.length : null,
      subcategories_user: Array.isArray(subcategories.user) ? subcategories.user.length : null,
      current_month_bank_transactions: transactions.length,
      current_month_exportable_transactions: exportableCount,
    },
    range,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
