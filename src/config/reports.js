/**
 * Sales report settings.
 *
 * These mirror sales_report() in supabase/sales_report.sql. A browser cannot
 * read a Postgres constant, so the duplication is unavoidable — what is
 * avoidable is it drifting unnoticed. tests/sales-report.test.js probes the
 * real database with these exact values.
 */

/** The three groupings FR-7.4 asks for. Must match the check in sales_report(). */
export const REPORT_PERIODS = {
  day: 'day',
  month: 'month',
  year: 'year',
}

export const ALL_REPORT_PERIODS = Object.values(REPORT_PERIODS)

export const DEFAULT_REPORT_PERIOD = REPORT_PERIODS.day

/**
 * How far back each grouping looks by default. A month of days, a year of
 * months, five years of years — each is about one screenful, which is the
 * point: a report you have to scroll to read is a spreadsheet.
 */
export const REPORT_WINDOW = {
  [REPORT_PERIODS.day]: 30,
  [REPORT_PERIODS.month]: 12,
  [REPORT_PERIODS.year]: 5,
}

/** Matches c_max_limit in sales_report(). */
export const MAX_REPORT_PERIODS = 366

/**
 * Buckets are cut in the shop's local time, server-side. Kept here only so the
 * UI can say so out loud — nothing in the browser does the grouping.
 */
export const SHOP_TIME_ZONE = 'Asia/Karachi'

export function isReportPeriod(value) {
  return ALL_REPORT_PERIODS.includes(value)
}
