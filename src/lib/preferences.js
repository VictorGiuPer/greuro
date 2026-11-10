export const SETTINGS_DEFAULTS = {
  // Completed months used by allocation Average and the savings calculator.
  savingsAverageMonths: 3,
  // Investment forecast: each account grows at its own expectedAnnualReturn;
  // best/worst bands shift every rate by ± this many percentage points.
  forecastBandSpread: 2,
  // Inflation (% p.a.) + whether the forecast defaults to real values.
  inflationRate: 2,
  inflationAdjust: false,
  forecastHorizonYears: 5,
  // "Keep investing": €/month contributed into `investmentTargetAccountId`
  // (default = highest-return investment account).
  monthlyInvestment: 0,
  investmentTargetAccountId: null,
  // Reminders "Due Soon" badge thresholds (days).
  dueSoonAmberDays: 3,
  dueSoonTealDays: 7,
  // First-run flow.
  onboarded: false,
  // Data management.
  lastBackupAt: null,
  // YYYY-MM of the month the monthly backup reminder was last shown.
  lastBackupReminderMonth: null,
  // Dashboard: which account the Cash Flow card shows (falls back to main).
  cashFlowAccountId: null,
  // The everyday account the savings tracker + cash-flow default use.
  mainAccountId: null,
  // "YYYY-MM" of the last month whose report the user has opened — drives
  // the Overview notification dot ("last month's report is ready").
  lastReportSeenMonth: null,
}
