/**
 * Matchpoint Technology Sales Management Web App
 * Initial Google Apps Script configuration.
 *
 * Replace the placeholder Spreadsheet ID with the ID from the Google Sheets URL:
 * https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
 */
const SPREADSHEET_ID = 'PASTE_MATCHPOINT_SALES_SPREADSHEET_ID_HERE';

/**
 * Canonical Google Sheet tab names used by the sales management application.
 */
const SHEET_NAMES = Object.freeze({
  CLIENTS: 'Clients',
  CONTACTS: 'Contacts',
  SOLUTIONS: 'Solutions',
  DEALS: 'Deals',
  DEAL_LINE_ITEMS: 'Deal Line Items',
  ACTIVITIES: 'Activities',
  USERS: 'Users',
  STAGE_HISTORY: 'Stage History',
});

/**
 * Opens the configured sales management spreadsheet.
 *
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet} The CRM database spreadsheet.
 */
function getCrmSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Gets a configured sheet by logical name.
 *
 * @param {string} sheetKey One of the keys from SHEET_NAMES, e.g. 'CLIENTS'.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} The requested sheet.
 * @throws {Error} When the logical sheet key or sheet tab does not exist.
 */
function getCrmSheet(sheetKey) {
  const sheetName = SHEET_NAMES[sheetKey];

  if (!sheetName) {
    throw new Error(`Unknown sheet key: ${sheetKey}`);
  }

  const sheet = getCrmSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Missing required sheet tab: ${sheetName}`);
  }

  return sheet;
}
