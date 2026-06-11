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
      .map(function (row) {
        return rowToObject(headers, row);
      })
      .filter(function (record) {
        return headers.some(function (header) {
          return !UtilService.isBlank(record[header]);
        });
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
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
    return rowToObject(headers, row);
  }

  function updateRecordById(sheetName, keyColumn, id, patch, expectedRowVersion) {
    var found = findRowById(sheetName, keyColumn, id);
    if (!found) throw UtilService.notFound(keyColumn + ' ' + id);

    var current = found.record;
    var headers = found.headers;
    if (headers.indexOf('RowVersion') !== -1 && !UtilService.isBlank(expectedRowVersion)) {
      var currentVersion = Number(current.RowVersion || 0);
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
    if (headers.indexOf('RowVersion') !== -1) {
      updated.RowVersion = Number(current.RowVersion || 0) + 1;
    }

    found.sheet.getRange(found.rowNumber, 1, 1, headers.length).setValues([objectToRow(headers, updated)]);
    return updated;
  }

  function softDeleteRecordById(sheetName, keyColumn, id, patch) {
    var softPatch = patch || {};
    softPatch.IsDeleted = true;
    return updateRecordById(sheetName, keyColumn, id, softPatch, null);
  }

  function generateId(prefix, sheetName, keyColumn) {
    var ym = Utilities.formatDate(new Date(), UtilService.getTimezone(), 'yyMM');
    var base = prefix + '-' + ym + '-';
    var max = 0;
    readTable(sheetName).forEach(function (record) {
      var value = String(record[keyColumn] || '');
      if (value.indexOf(base) === 0) {
        var numericPart = Number(value.replace(base, ''));
        if (!isNaN(numericPart) && numericPart > max) max = numericPart;
      }
    });
    return base + UtilService.padNumber(max + 1, 4);
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
    lock.waitLock(timeoutMs || 30000);
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
    readTable: readTable,
    findRowById: findRowById,
    appendRecord: appendRecord,
    updateRecordById: updateRecordById,
    softDeleteRecordById: softDeleteRecordById,
    objectToRow: objectToRow,
    rowToObject: rowToObject,
    generateId: generateId,
    clearDataRows: clearDataRows,
    withScriptLock: withScriptLock
  };
})();
