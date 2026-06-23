var DbService = (function () {
  function getSpreadsheet() {
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw UtilService.createError(
      CRM_CONFIG.ERROR_CODES.SHEET_ERROR,
      'Spreadsheet is not configured. Bind this script to a Google Sheet or set Script Property SPREADSHEET_ID.'
    );
  }

  function getSpreadsheetForSetup() {
    try {
      return getSpreadsheet();
    } catch (err) {
      var created = SpreadsheetApp.create(CRM_CONFIG.APP.NAME + ' Database');
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', created.getId());
      return created;
    }
  }

  function sheetExists(name) {
    try {
      return !!getSpreadsheet().getSheetByName(name);
    } catch (err) {
      return false;
    }
  }

  function getSheet(name) {
    var sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.SHEET_ERROR,
        'Required sheet "' + name + '" was not found. Run setupDatabase() first.'
      );
    }
    return sheet;
  }

  function getHeaders(sheet) {
    if (sheet.getLastColumn() < 1) return [];
    return sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(function (header) {
        return String(header || '').trim();
      })
      .filter(function (header) {
        return header !== '';
      });
  }

  function getHeaderMap(sheet) {
    var headers = getHeaders(sheet);
    var map = {};
    headers.forEach(function (header, index) {
      map[header] = index + 1;
    });
    return map;
  }

  function validateRequiredHeaders(sheetName) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var missing = [];
    (CRM_CONFIG.HEADERS[sheetName] || []).forEach(function (header) {
      if (headers.indexOf(header) === -1) missing.push(header);
    });
    if (missing.length) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.SHEET_ERROR,
        'Sheet "' + sheetName + '" is missing required headers: ' + missing.join(', ') + '.',
        missing.map(function (header) {
          return { field: header, message: 'Missing header.' };
        })
      );
    }
    return true;
  }

  function rowToObject(headers, row) {
    var output = {};
    headers.forEach(function (header, index) {
      var value = row[index];
      output[header] = Object.prototype.toString.call(value) === '[object Date]'
        ? UtilService.formatDateTime(value)
        : value;
    });
    return output;
  }

  function hasMeaningfulValue_(row) {
    return row.some(function (value) {
      if (value === false || value === null || value === undefined) return false;
      if (Object.prototype.toString.call(value) === '[object Date]') return true;
      return String(value).trim() !== '';
    });
  }

  function getLastMeaningfulRow_(sheet, headers) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2 || headers.length === 0) return 1;
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (hasMeaningfulValue_(rows[i])) return i + 2;
    }
    return 1;
  }

  function objectToRow(headers, object) {
    return headers.map(function (header) {
      var value = object && Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
      return value === undefined || value === null ? '' : value;
    });
  }

  function readTable(sheetName) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2 || headers.length === 0) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return rows
      .filter(function (row) {
        return hasMeaningfulValue_(row);
      })
      .map(function (row) {
        return rowToObject(headers, row);
      });
  }

  function findRowById(sheetName, keyColumn, id) {
    if (UtilService.isBlank(id)) return null;
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var keyIndex = headers.indexOf(keyColumn);
    if (keyIndex === -1) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.SHEET_ERROR,
        'Key column "' + keyColumn + '" was not found on sheet "' + sheetName + '".'
      );
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var finder = sheet
      .getRange(2, keyIndex + 1, lastRow - 1, 1)
      .createTextFinder(String(id))
      .matchEntireCell(true);
    var cell = finder.findNext();
    if (!cell) return null;
    var rowNumber = cell.getRow();
    var values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    return {
      sheet: sheet,
      headers: headers,
      rowNumber: rowNumber,
      row: values,
      record: rowToObject(headers, values)
    };
  }

  function appendRecord(sheetName, record) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var row = objectToRow(headers, record);
    var nextRow = Math.max(2, getLastMeaningfulRow_(sheet, headers) + 1);
    sheet.getRange(nextRow, 1, 1, headers.length).setValues([row]);
    return rowToObject(headers, row);
  }

  function appendRecords(sheetName, records) {
    records = records || [];
    if (!records.length) return [];
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var rows = records.map(function (record) {
      return objectToRow(headers, record);
    });
    var nextRow = Math.max(2, getLastMeaningfulRow_(sheet, headers) + 1);
    sheet.getRange(nextRow, 1, rows.length, headers.length).setValues(rows);
    return rows.map(function (row) {
      return rowToObject(headers, row);
    });
  }

  function updateRecordById(sheetName, keyColumn, id, patch, expectedRowVersion) {
    var found = findRowById(sheetName, keyColumn, id);
    if (!found) throw UtilService.notFound(keyColumn + ' ' + id);

    var current = found.record;
    var headers = found.headers;
    var versionField = headers.indexOf('RecordVersion') !== -1 ? 'RecordVersion' : (headers.indexOf('RowVersion') !== -1 ? 'RowVersion' : '');
    if (versionField && !UtilService.isBlank(expectedRowVersion)) {
      var currentVersion = Number(current[versionField] || 0);
      var expectedVersion = Number(expectedRowVersion);
      if (currentVersion !== expectedVersion) {
        throw UtilService.createError(
          CRM_CONFIG.ERROR_CODES.VERSION_CONFLICT,
          'This record was updated by another user. Please reload before saving.'
        );
      }
    }

    var updated = {};
    headers.forEach(function (header) {
      updated[header] = Object.prototype.hasOwnProperty.call(current, header) ? current[header] : '';
    });
    Object.keys(patch || {}).forEach(function (key) {
      if (headers.indexOf(key) !== -1) updated[key] = patch[key];
    });
    if (versionField) {
      updated[versionField] = Number(current[versionField] || 0) + 1;
    }

    found.sheet.getRange(found.rowNumber, 1, 1, headers.length).setValues([objectToRow(headers, updated)]);
    return updated;
  }

  function softDeleteRecordById(sheetName, keyColumn, id, patch) {
    var softPatch = patch || {};
    softPatch.IsDeleted = true;
    return updateRecordById(sheetName, keyColumn, id, softPatch, null);
  }

  function generateUuid(prefix) {
    return String(prefix || 'ID') + '-' + Utilities.getUuid();
  }

  function generateDocumentNumber(prefix) {
    var currentDate = new Date();
    var ym = Utilities.formatDate(currentDate, UtilService.getTimezone(), 'yyyyMM');
    var propertyKey = 'RUNNING_NUMBER_' + String(prefix || 'DOC') + '_' + ym;
    var properties = PropertiesService.getScriptProperties();
    var next = Number(properties.getProperty(propertyKey) || 0) + 1;
    properties.setProperty(propertyKey, String(next));
    return String(prefix || 'DOC') + '-' + ym + '-' + UtilService.padNumber(next, 4);
  }

  function clearDataRows(sheetName) {
    var sheet = getSheet(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, Math.max(1, sheet.getLastColumn())).clearContent();
    }
  }

  function withScriptLock(callback, timeoutMs) {
    var lock = LockService.getScriptLock();
    var waitMs = timeoutMs === undefined ? 10000 : timeoutMs;
    if (!lock.tryLock(waitMs)) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.SHEET_ERROR,
        'Another MATCHPOINT CRM operation is still running. Wait a moment, then run setup again.'
      );
    }
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSpreadsheetForSetup: getSpreadsheetForSetup,
    sheetExists: sheetExists,
    getSheet: getSheet,
    getHeaders: getHeaders,
    getHeaderMap: getHeaderMap,
    validateRequiredHeaders: validateRequiredHeaders,
    readTable: readTable,
    findRowById: findRowById,
    appendRecord: appendRecord,
    appendRecords: appendRecords,
    updateRecordById: updateRecordById,
    softDeleteRecordById: softDeleteRecordById,
    objectToRow: objectToRow,
    rowToObject: rowToObject,
    hasMeaningfulValue: hasMeaningfulValue_,
    generateUuid: generateUuid,
    generateDocumentNumber: generateDocumentNumber,
    clearDataRows: clearDataRows,
    withScriptLock: withScriptLock
  };
})();
