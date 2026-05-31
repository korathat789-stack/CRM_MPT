/**
 * Matchpoint Technology Sales Management Web App
 * Google Apps Script backend configuration and CRUD helpers.
 *
 * Replace the placeholder Spreadsheet ID with the ID from the Google Sheets URL:
 * https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
 */
const SPREADSHEET_ID = 'PASTE_MATCHPOINT_SALES_SPREADSHEET_ID_HERE';
const HTML_TEMPLATE_FILE = 'Index';

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
 * Per-sheet primary-key headers and ID prefixes.
 */
const SHEET_CONFIGS = Object.freeze({
  CLIENTS: Object.freeze({ primaryKey: 'Client ID', idPrefix: 'CLI' }),
  CONTACTS: Object.freeze({ primaryKey: 'Contact ID', idPrefix: 'CON' }),
  SOLUTIONS: Object.freeze({ primaryKey: 'Solution ID', idPrefix: 'SOL' }),
  DEALS: Object.freeze({ primaryKey: 'Deal ID', idPrefix: 'DEA' }),
  DEAL_LINE_ITEMS: Object.freeze({ primaryKey: 'Line Item ID', idPrefix: 'DLI' }),
  ACTIVITIES: Object.freeze({ primaryKey: 'Activity ID', idPrefix: 'ACT' }),
  USERS: Object.freeze({ primaryKey: 'User ID', idPrefix: 'USR' }),
  STAGE_HISTORY: Object.freeze({ primaryKey: 'Stage History ID', idPrefix: 'STH' }),
});

/**
 * Serves the sales management web app interface.
 *
 * @param {GoogleAppsScript.Events.DoGet} e Request event.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Rendered HTML interface.
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile(HTML_TEMPLATE_FILE);
    template.query = e && e.parameter ? e.parameter : {};

    return template
      .evaluate()
      .setTitle('Matchpoint Technology Sales Management')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    const response = createJsonResponse_(null, error);

    return HtmlService
      .createHtmlOutput(`<pre>${escapeHtml_(JSON.stringify(response, null, 2))}</pre>`)
      .setTitle('Matchpoint Technology Sales Management - Error');
  }
}

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

/**
 * Creates a row in the requested sheet.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {Object} record Field/value payload keyed by sheet column headers.
 * @return {Object} Standard JSON response with the created record.
 */
function createRecord(sheetKey, record) {
  let lock;
  let lockAcquired = false;

  try {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    lockAcquired = true;

    const sheetContext = getSheetContext_(sheetKey);
    const now = new Date();
    const normalizedRecord = normalizeRecord_(record);

    ensureRecordHasId_(sheetContext, normalizedRecord);

    if (findRowById_(sheetContext, normalizedRecord[sheetContext.config.primaryKey])) {
      throw new Error(
        `Duplicate ${sheetContext.config.primaryKey}: ${normalizedRecord[sheetContext.config.primaryKey]}`
      );
    }

    applyCreateTimestamps_(sheetContext.headers, normalizedRecord, now);

    const rowValues = sheetContext.headers.map((header) => {
      return Object.prototype.hasOwnProperty.call(normalizedRecord, header)
        ? normalizedRecord[header]
        : '';
    });

    sheetContext.sheet.appendRow(rowValues);

    return createJsonResponse_({
      sheetKey,
      record: normalizedRecord,
      rowNumber: sheetContext.sheet.getLastRow(),
    });
  } catch (error) {
    return createJsonResponse_(null, error);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Reads rows from the requested sheet.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {Object=} options Optional read settings: id, filters, limit, offset.
 * @return {Object} Standard JSON response with matching records.
 */
function readRecords(sheetKey, options) {
  try {
    const sheetContext = getSheetContext_(sheetKey);
    const readOptions = options || {};
    const allRecords = getSheetRecords_(sheetContext);
    let records = allRecords;

    if (readOptions.id) {
      records = records.filter((record) => {
        return String(record[sheetContext.config.primaryKey]) === String(readOptions.id);
      });
    }

    if (readOptions.filters) {
      records = filterRecords_(records, readOptions.filters);
    }

    const offset = Math.max(Number(readOptions.offset) || 0, 0);
    const limit = Number(readOptions.limit) || records.length;
    const pagedRecords = records.slice(offset, offset + limit);

    return createJsonResponse_({
      sheetKey,
      records: pagedRecords,
      total: records.length,
      offset,
      limit,
    });
  } catch (error) {
    return createJsonResponse_(null, error);
  }
}

/**
 * Reads a single row by primary-key value.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {string} id Primary-key value.
 * @return {Object} Standard JSON response with the matching record or null.
 */
function getRecordById(sheetKey, id) {
  try {
    const sheetContext = getSheetContext_(sheetKey);
    const rowMatch = findRowById_(sheetContext, id);

    return createJsonResponse_({
      sheetKey,
      record: rowMatch ? rowMatch.record : null,
      rowNumber: rowMatch ? rowMatch.rowNumber : null,
    });
  } catch (error) {
    return createJsonResponse_(null, error);
  }
}

/**
 * Updates a row by primary-key value.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {string} id Primary-key value.
 * @param {Object} updates Field/value payload keyed by sheet column headers.
 * @return {Object} Standard JSON response with the updated record.
 */
function updateRecord(sheetKey, id, updates) {
  let lock;
  let lockAcquired = false;

  try {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    lockAcquired = true;

    const sheetContext = getSheetContext_(sheetKey);
    const rowMatch = findRowById_(sheetContext, id);

    if (!rowMatch) {
      throw new Error(`Record not found in ${SHEET_NAMES[sheetKey]}: ${id}`);
    }

    const normalizedUpdates = normalizeRecord_(updates);
    delete normalizedUpdates[sheetContext.config.primaryKey];
    applyUpdateTimestamp_(sheetContext.headers, normalizedUpdates, new Date());

    const updatedRecord = Object.assign({}, rowMatch.record, normalizedUpdates);
    const rowValues = sheetContext.headers.map((header) => {
      return Object.prototype.hasOwnProperty.call(updatedRecord, header)
        ? updatedRecord[header]
        : '';
    });

    sheetContext.sheet
      .getRange(rowMatch.rowNumber, 1, 1, sheetContext.headers.length)
      .setValues([rowValues]);

    return createJsonResponse_({
      sheetKey,
      record: updatedRecord,
      rowNumber: rowMatch.rowNumber,
    });
  } catch (error) {
    return createJsonResponse_(null, error);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Deletes a row by primary-key value.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {string} id Primary-key value.
 * @return {Object} Standard JSON response with the deleted record.
 */
function deleteRecord(sheetKey, id) {
  let lock;
  let lockAcquired = false;

  try {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    lockAcquired = true;

    const sheetContext = getSheetContext_(sheetKey);
    const rowMatch = findRowById_(sheetContext, id);

    if (!rowMatch) {
      throw new Error(`Record not found in ${SHEET_NAMES[sheetKey]}: ${id}`);
    }

    sheetContext.sheet.deleteRow(rowMatch.rowNumber);

    return createJsonResponse_({
      sheetKey,
      deletedRecord: rowMatch.record,
      deletedRowNumber: rowMatch.rowNumber,
    });
  } catch (error) {
    return createJsonResponse_(null, error);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Convenience alias for createRecord().
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {Object} record Field/value payload keyed by sheet column headers.
 * @return {Object} Standard JSON response with the created record.
 */
function createCrmRecord(sheetKey, record) {
  return createRecord(sheetKey, record);
}

/**
 * Convenience alias for readRecords().
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {Object=} options Optional read settings: id, filters, limit, offset.
 * @return {Object} Standard JSON response with matching records.
 */
function readCrmRecords(sheetKey, options) {
  return readRecords(sheetKey, options);
}

/**
 * Convenience alias for updateRecord().
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {string} id Primary-key value.
 * @param {Object} updates Field/value payload keyed by sheet column headers.
 * @return {Object} Standard JSON response with the updated record.
 */
function updateCrmRecord(sheetKey, id, updates) {
  return updateRecord(sheetKey, id, updates);
}

/**
 * Convenience alias for deleteRecord().
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @param {string} id Primary-key value.
 * @return {Object} Standard JSON response with the deleted record.
 */
function deleteCrmRecord(sheetKey, id) {
  return deleteRecord(sheetKey, id);
}

/**
 * Builds a standard JSON response for every backend function.
 *
 * @param {*=} data Successful response payload.
 * @param {*=} error Error object or message.
 * @return {Object} Standard response object.
 */
function createJsonResponse_(data, error) {
  if (error) {
    return {
      status: 'error',
      data: null,
      message: error.message || String(error),
    };
  }

  return {
    status: 'success',
    data: data === undefined ? null : sanitizeForJson_(data),
    message: '',
  };
}


/**
 * Recursively converts response payload values into JSON-safe values.
 *
 * @param {*} value Response payload value.
 * @return {*} JSON-safe value.
 */
function sanitizeForJson_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson_(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((sanitized, key) => {
      sanitized[key] = sanitizeForJson_(value[key]);
      return sanitized;
    }, {});
  }

  return value;
}

/**
 * Resolves the sheet, headers, and config for a logical sheet key.
 *
 * @param {string} sheetKey Logical sheet key from SHEET_NAMES.
 * @return {Object} Sheet context.
 * @throws {Error} When sheet config or headers are invalid.
 */
function getSheetContext_(sheetKey) {
  const config = SHEET_CONFIGS[sheetKey];

  if (!config) {
    throw new Error(`Missing sheet configuration for key: ${sheetKey}`);
  }

  const sheet = getCrmSheet(sheetKey);
  const headers = getSheetHeaders_(sheet);

  if (headers.indexOf(config.primaryKey) === -1) {
    throw new Error(`Missing primary-key header "${config.primaryKey}" in ${sheet.getName()}`);
  }

  return {
    config,
    headers,
    sheet,
  };
}

/**
 * Reads and validates header values from row 1.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet to inspect.
 * @return {string[]} Header names.
 * @throws {Error} When no headers exist.
 */
function getSheetHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error(`Sheet "${sheet.getName()}" does not contain headers in row 1`);
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => String(header).trim());

  if (headers.every((header) => !header)) {
    throw new Error(`Sheet "${sheet.getName()}" does not contain headers in row 1`);
  }

  return headers;
}

/**
 * Reads all data rows from a sheet context as objects.
 *
 * @param {Object} sheetContext Sheet context from getSheetContext_().
 * @return {Object[]} Records.
 */
function getSheetRecords_(sheetContext) {
  const lastRow = sheetContext.sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const rows = sheetContext.sheet
    .getRange(2, 1, lastRow - 1, sheetContext.headers.length)
    .getValues();

  return rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row) => rowToRecord_(sheetContext.headers, row));
}

/**
 * Converts a sheet row array to an object keyed by headers.
 *
 * @param {string[]} headers Header names.
 * @param {*[]} row Row values.
 * @return {Object} Record object.
 */
function rowToRecord_(headers, row) {
  return headers.reduce((record, header, index) => {
    if (header) {
      record[header] = serializeSheetValue_(row[index]);
    }

    return record;
  }, {});
}

/**
 * Finds a row by primary-key value.
 *
 * @param {Object} sheetContext Sheet context from getSheetContext_().
 * @param {string} id Primary-key value.
 * @return {Object|null} Match with rowNumber and record, or null.
 * @throws {Error} When no ID is provided.
 */
function findRowById_(sheetContext, id) {
  if (id === undefined || id === null || id === '') {
    throw new Error('A record ID is required');
  }

  const primaryKey = sheetContext.config.primaryKey;
  const lastRow = sheetContext.sheet.getLastRow();

  if (lastRow <= 1) {
    return null;
  }

  const rows = sheetContext.sheet
    .getRange(2, 1, lastRow - 1, sheetContext.headers.length)
    .getValues();

  for (let index = 0; index < rows.length; index += 1) {
    const record = rowToRecord_(sheetContext.headers, rows[index]);

    if (String(record[primaryKey]) === String(id)) {
      return {
        record,
        rowNumber: index + 2,
      };
    }
  }

  return null;
}

/**
 * Applies exact-match filters to records.
 *
 * @param {Object[]} records Records to filter.
 * @param {Object} filters Field/value filter pairs.
 * @return {Object[]} Matching records.
 */
function filterRecords_(records, filters) {
  return records.filter((record) => {
    return Object.keys(filters).every((fieldName) => {
      return String(record[fieldName]) === String(filters[fieldName]);
    });
  });
}

/**
 * Normalizes a client-provided payload.
 *
 * @param {Object} record Field/value payload.
 * @return {Object} Normalized copy.
 * @throws {Error} When payload is invalid.
 */
function normalizeRecord_(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Record payload must be an object keyed by sheet column headers');
  }

  return Object.assign({}, record);
}

/**
 * Ensures a new record contains a primary-key value.
 *
 * @param {Object} sheetContext Sheet context from getSheetContext_().
 * @param {Object} record Record to mutate.
 */
function ensureRecordHasId_(sheetContext, record) {
  const primaryKey = sheetContext.config.primaryKey;

  if (!record[primaryKey]) {
    record[primaryKey] = generateRecordId_(sheetContext);
  }
}

/**
 * Generates a new record ID using the sheet prefix and current max sequence.
 *
 * @param {Object} sheetContext Sheet context from getSheetContext_().
 * @return {string} Generated record ID.
 */
function generateRecordId_(sheetContext) {
  const primaryKeyIndex = sheetContext.headers.indexOf(sheetContext.config.primaryKey) + 1;
  const lastRow = sheetContext.sheet.getLastRow();
  let maxSequence = 0;

  if (lastRow > 1) {
    const idValues = sheetContext.sheet
      .getRange(2, primaryKeyIndex, lastRow - 1, 1)
      .getValues()
      .flat();

    idValues.forEach((idValue) => {
      const match = String(idValue).match(new RegExp(`^${sheetContext.config.idPrefix}-(\\d+)$`));

      if (match) {
        maxSequence = Math.max(maxSequence, Number(match[1]));
      }
    });
  }

  return `${sheetContext.config.idPrefix}-${String(maxSequence + 1).padStart(4, '0')}`;
}

/**
 * Adds Created At and Updated At timestamps on create when headers exist.
 *
 * @param {string[]} headers Sheet headers.
 * @param {Object} record Record to mutate.
 * @param {Date} now Timestamp.
 */
function applyCreateTimestamps_(headers, record, now) {
  if (headers.indexOf('Created At') !== -1 && !record['Created At']) {
    record['Created At'] = now;
  }

  if (headers.indexOf('Updated At') !== -1 && !record['Updated At']) {
    record['Updated At'] = now;
  }
}

/**
 * Adds an Updated At timestamp on update when the header exists.
 *
 * @param {string[]} headers Sheet headers.
 * @param {Object} record Record to mutate.
 * @param {Date} now Timestamp.
 */
function applyUpdateTimestamp_(headers, record, now) {
  if (headers.indexOf('Updated At') !== -1) {
    record['Updated At'] = now;
  }
}

/**
 * Converts sheet-native values into JSON-safe values.
 *
 * @param {*} value Sheet cell value.
 * @return {*} JSON-safe value.
 */
function serializeSheetValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return value;
}

/**
 * Escapes text for safe HTML display.
 *
 * @param {string} value Raw text.
 * @return {string} Escaped text.
 */
function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
