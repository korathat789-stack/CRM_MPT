var MigrationService = (function () {
  var SOURCE_HEADERS = {
    CONTACT_DATE: 'วันที่ติดต่อ',
    CUSTOMER_NAME: 'ชื่อลูกค้า',
    CUSTOMER_TYPE: 'ประเภท',
    STATUS: 'สถานะโครงการ',
    DETAIL: 'รายละเอียดงาน/Hardware',
    VALUE: 'มูลค่าโครงการ',
    OWNER: 'ผู้รับผิดชอบ',
    NEXT_STEP: 'สิ่งที่ต้องทำต่อ (Next Step)',
    EXTRA: 'Column9'
  };

  function rowHash_(row) {
    var raw = JSON.stringify(row || {});
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw)).replace(/=+$/, '');
  }

  function sourceKey_(sourceWorkbook, sourceSheet, rowNumber, row) {
    return [sourceWorkbook || 'workbook', sourceSheet || 'sheet', rowNumber || '0', rowHash_(row)].join(':');
  }

  function sourceValue_(row, header) {
    return row && Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
  }

  function normalizeDate_(value) {
    if (!value) return '';
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, UtilService.getTimezone(), 'yyyy-MM-dd');
    }
    var parsed = Date.parse(value);
    if (!isNaN(parsed)) return Utilities.formatDate(new Date(parsed), UtilService.getTimezone(), 'yyyy-MM-dd');
    return String(value).trim();
  }

  function parseNumber_(value) {
    if (UtilService.isBlank(value)) return 0;
    var parsed = Number(String(value).replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  function mapStage_(sourceStatus) {
    var raw = String(sourceStatus || '').trim();
    return CRM_CONFIG.SOURCE_STAGE_MAP[raw] || CRM_CONFIG.SOURCE_STAGE_MAP[raw.toLowerCase()] || 'NEW_INQUIRY';
  }

  function activeUserId_(user) {
    return user.userId || (user.raw && user.raw.UserID) || '';
  }

  function findCustomerByName_(companyName) {
    var normalized = UtilService.normalize(companyName);
    if (!normalized) return null;
    var customers = DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS);
    for (var i = 0; i < customers.length; i++) {
      if (!UtilService.asBoolean(customers[i].IsDeleted)
        && UtilService.normalize(customers[i].CompanyNameTH || customers[i].CompanyNameEN) === normalized) {
        return customers[i];
      }
    }
    return null;
  }

  function sourceAlreadyImported_(externalSourceKey) {
    if (!externalSourceKey) return false;
    return DbService.readTable(CRM_CONFIG.SHEETS.OPPORTUNITIES).some(function (opportunity) {
      return !UtilService.asBoolean(opportunity.IsDeleted) && opportunity.ExternalSourceKey === externalSourceKey;
    });
  }

  function validateSourceRow_(row, rowNumber) {
    var errors = [];
    if (UtilService.isBlank(sourceValue_(row, SOURCE_HEADERS.CONTACT_DATE))) {
      errors.push({ rowNumber: rowNumber, field: SOURCE_HEADERS.CONTACT_DATE, message: 'Contact date is required.' });
    }
    if (UtilService.isBlank(sourceValue_(row, SOURCE_HEADERS.CUSTOMER_NAME))) {
      errors.push({ rowNumber: rowNumber, field: SOURCE_HEADERS.CUSTOMER_NAME, message: 'Customer name is required.' });
    }
    var projectValue = sourceValue_(row, SOURCE_HEADERS.VALUE);
    if (!UtilService.isBlank(projectValue) && isNaN(parseNumber_(projectValue))) {
      errors.push({ rowNumber: rowNumber, field: SOURCE_HEADERS.VALUE, message: 'Project value must be numeric.' });
    }
    return errors;
  }

  function normalizeRows_(rows, sourceWorkbook, sourceSheet) {
    return (rows || []).map(function (row, index) {
      var rowNumber = row.SourceRowNumber || row._rowNumber || index + 2;
      return {
        rowNumber: rowNumber,
        sourceKey: sourceKey_(sourceWorkbook, sourceSheet, rowNumber, row),
        source: row,
        errors: validateSourceRow_(row, rowNumber)
      };
    });
  }

  function readSpreadsheetRows_(sourceSpreadsheetId, sourceSheetName) {
    if (UtilService.isBlank(sourceSpreadsheetId)) {
      throw UtilService.validationError([{ field: 'sourceSpreadsheetId', message: 'Source spreadsheet ID is required.' }]);
    }
    var spreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
    var sheet = sourceSheetName ? spreadsheet.getSheetByName(sourceSheetName) : spreadsheet.getSheets()[0];
    if (!sheet) throw UtilService.notFound('Source sheet');
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return { workbook: spreadsheet.getName(), sheet: sheet.getName(), rows: [] };
    var headers = values[0].map(function (value, index) {
      return String(value || ('Column' + (index + 1))).trim();
    });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var record = { SourceRowNumber: r + 1 };
      var hasValue = false;
      for (var c = 0; c < headers.length; c++) {
        record[headers[c]] = values[r][c];
        if (!UtilService.isBlank(values[r][c])) hasValue = true;
      }
      if (hasValue) rows.push(record);
    }
    return { workbook: spreadsheet.getName(), sheet: sheet.getName(), rows: rows };
  }

  function previewMigrationRows(user, rows, options) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER]);
    options = options || {};
    var normalized = normalizeRows_(rows, options.sourceWorkbook || 'uploaded workbook', options.sourceSheet || 'source');
    var errors = [];
    var duplicateCount = 0;
    normalized.forEach(function (item) {
      errors = errors.concat(item.errors);
      if (sourceAlreadyImported_(item.sourceKey)) duplicateCount += 1;
    });
    AuditService.logAction(
      CRM_CONFIG.AUDIT_ACTIONS.MIGRATION_PREVIEW,
      'Migration',
      options.sourceWorkbook || 'uploaded workbook',
      {},
      { rowsRead: normalized.length, errors: errors.length, duplicates: duplicateCount },
      user,
      'previewMigrationRows'
    );
    return {
      rowsRead: normalized.length,
      rowsValid: normalized.length - errors.length,
      rowsWithErrors: errors.length,
      duplicateRows: duplicateCount,
      errors: errors.slice(0, 200),
      mapping: getMigrationMapping()
    };
  }

  function previewMigrationFromSpreadsheet(user, sourceSpreadsheetId, sourceSheetName) {
    var source = readSpreadsheetRows_(sourceSpreadsheetId, sourceSheetName);
    return previewMigrationRows(user, source.rows, {
      sourceWorkbook: source.workbook,
      sourceSheet: source.sheet
    });
  }

  function importMigrationRows(user, rows, options) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER]);
    options = options || {};
    var sourceWorkbook = options.sourceWorkbook || 'uploaded workbook';
    var sourceSheet = options.sourceSheet || 'source';
    var normalized = normalizeRows_(rows, sourceWorkbook, sourceSheet);
    var runId = DbService.generateUuid('MIG');
    var now = UtilService.nowIso();
    var run = {
      MigrationRunID: runId,
      SourceWorkbook: sourceWorkbook,
      SourceSheet: sourceSheet,
      StartedAt: now,
      CompletedAt: '',
      RunByUserID: activeUserId_(user),
      Mode: options.mode || 'IMPORT',
      RowsRead: normalized.length,
      RowsValid: 0,
      RowsImported: 0,
      RowsSkipped: 0,
      RowsFailed: 0,
      Status: 'RUNNING',
      SummaryJson: ''
    };
    DbService.appendRecord(CRM_CONFIG.SHEETS.MIGRATION_RUNS, run);

    var failures = [];
    var imported = 0;
    var skipped = 0;
    var valid = 0;
    normalized.forEach(function (item) {
      if (item.errors.length) {
        failures = failures.concat(item.errors.map(function (error) {
          return {
            MigrationErrorID: DbService.generateUuid('MIGE'),
            MigrationRunID: runId,
            SourceRowNumber: error.rowNumber,
            FieldName: error.field,
            ErrorCode: 'VALIDATION_ERROR',
            ErrorMessage: error.message,
            SourceHash: rowHash_(item.source),
            CreatedAt: UtilService.nowIso()
          };
        }));
        return;
      }
      valid += 1;
      if (sourceAlreadyImported_(item.sourceKey)) {
        skipped += 1;
        return;
      }
      try {
        importOneRow_(user, item, sourceWorkbook, sourceSheet, runId);
        imported += 1;
      } catch (err) {
        failures.push({
          MigrationErrorID: DbService.generateUuid('MIGE'),
          MigrationRunID: runId,
          SourceRowNumber: item.rowNumber,
          FieldName: '',
          ErrorCode: err && err.code ? err.code : 'IMPORT_ERROR',
          ErrorMessage: err && err.message ? err.message : String(err),
          SourceHash: rowHash_(item.source),
          CreatedAt: UtilService.nowIso()
        });
      }
    });
    if (failures.length) DbService.appendRecords(CRM_CONFIG.SHEETS.MIGRATION_ERRORS, failures);
    var completed = UtilService.nowIso();
    var summary = {
      rowsRead: normalized.length,
      rowsValid: valid,
      rowsImported: imported,
      rowsSkipped: skipped,
      rowsFailed: failures.length
    };
    DbService.updateRecordById(CRM_CONFIG.SHEETS.MIGRATION_RUNS, 'MigrationRunID', runId, {
      CompletedAt: completed,
      RowsValid: valid,
      RowsImported: imported,
      RowsSkipped: skipped,
      RowsFailed: failures.length,
      Status: failures.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      SummaryJson: UtilService.stringifyJson(summary)
    }, null);
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.MIGRATION_IMPORT, 'Migration', runId, {}, summary, user, 'importMigrationRows');
    return Object.assign({ migrationRunId: runId }, summary, { errors: failures.slice(0, 200) });
  }

  function importMigrationFromSpreadsheet(user, sourceSpreadsheetId, sourceSheetName) {
    var source = readSpreadsheetRows_(sourceSpreadsheetId, sourceSheetName);
    return importMigrationRows(user, source.rows, {
      sourceWorkbook: source.workbook,
      sourceSheet: source.sheet
    });
  }

  function importOneRow_(user, item, sourceWorkbook, sourceSheet, migrationRunId) {
    var row = item.source;
    var customerName = String(sourceValue_(row, SOURCE_HEADERS.CUSTOMER_NAME) || '').trim();
    var customer = findCustomerByName_(customerName);
    if (!customer) {
      customer = EntityService.saveRecord(user, 'customers', {
        CustomerType: sourceValue_(row, SOURCE_HEADERS.CUSTOMER_TYPE) || 'อื่นๆ',
        CompanyNameTH: customerName,
        CustomerSource: 'Excel ' + sourceWorkbook,
        CustomerStatus: 'Prospect',
        OwnerUserID: activeUserId_(user),
        Notes: 'Imported from ' + sourceSheet + ' row ' + item.rowNumber,
        ExternalSourceKey: sourceWorkbook + ':' + customerName
      });
    }
    var detail = String(sourceValue_(row, SOURCE_HEADERS.DETAIL) || '').trim();
    var projectValue = parseNumber_(sourceValue_(row, SOURCE_HEADERS.VALUE));
    var contactDate = normalizeDate_(sourceValue_(row, SOURCE_HEADERS.CONTACT_DATE));
    var nextStep = String(sourceValue_(row, SOURCE_HEADERS.NEXT_STEP) || '').trim();
    var stage = mapStage_(sourceValue_(row, SOURCE_HEADERS.STATUS));
    var opportunity = EntityService.saveRecord(user, 'opportunities', {
      CustomerID: customer.CustomerID,
      OpportunityName: detail ? detail.slice(0, 120) : 'Imported opportunity',
      Source: sourceValue_(row, SOURCE_HEADERS.CUSTOMER_TYPE) || 'Excel',
      OwnerUserID: activeUserId_(user),
      Stage: stage,
      EstimatedValue: projectValue,
      LastContactDate: contactDate,
      NextFollowUpDate: '',
      ProductCategory: '',
      Notes: [
        detail,
        sourceValue_(row, SOURCE_HEADERS.EXTRA),
        'Source: ' + sourceWorkbook + ' / ' + sourceSheet + ' row ' + item.rowNumber
      ].filter(function (text) { return !UtilService.isBlank(text); }).join('\n'),
      ExternalSourceKey: item.sourceKey,
      MigrationRunID: migrationRunId
    });
    EntityService.saveRecord(user, 'activities', {
      CustomerID: customer.CustomerID,
      OpportunityID: opportunity.OpportunityID,
      ActivityType: 'Follow-up',
      Subject: nextStep || 'Imported follow-up',
      Description: detail,
      ActivityDate: contactDate,
      DueDate: '',
      ActivityStatus: nextStep ? 'Open' : 'Completed',
      Priority: 'Medium',
      AssignedToUserID: activeUserId_(user),
      Outcome: sourceValue_(row, SOURCE_HEADERS.STATUS),
      ExternalSourceKey: item.sourceKey + ':activity',
      MigrationRunID: migrationRunId
    });
  }

  function rollbackMigration(user, migrationRunId) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    if (UtilService.isBlank(migrationRunId)) {
      throw UtilService.validationError([{ field: 'MigrationRunID', message: 'MigrationRunID is required.' }]);
    }
    var touched = 0;
    ['activities', 'opportunities'].forEach(function (entityName) {
      var config = CRM_CONFIG.ENTITY_CONFIG[entityName];
      DbService.readTable(config.sheet).forEach(function (record) {
        if (String(record.MigrationRunID || '') === String(migrationRunId) && !UtilService.asBoolean(record.IsDeleted)) {
          EntityService.deleteRecord(user, entityName, record[config.key]);
          touched += 1;
        }
      });
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.MIGRATION_ROLLBACK, 'Migration', migrationRunId, {}, { recordsDeleted: touched }, user, 'rollbackMigration');
    return { migrationRunId: migrationRunId, recordsDeleted: touched };
  }

  function getMigrationMapping() {
    return [
      { sourceColumn: SOURCE_HEADERS.CONTACT_DATE, targetSheet: 'Activities', targetField: 'ActivityDate', rule: 'Date normalized to yyyy-MM-dd.' },
      { sourceColumn: SOURCE_HEADERS.CUSTOMER_NAME, targetSheet: 'Customers', targetField: 'CompanyNameTH', rule: 'Create or reuse customer by normalized company name.' },
      { sourceColumn: SOURCE_HEADERS.CUSTOMER_TYPE, targetSheet: 'Customers / Opportunities', targetField: 'CustomerType / Source', rule: 'Stored as customer type and opportunity source.' },
      { sourceColumn: SOURCE_HEADERS.STATUS, targetSheet: 'Opportunities', targetField: 'Stage', rule: 'Mapped by SOURCE_STAGE_MAP; defaults to NEW_INQUIRY.' },
      { sourceColumn: SOURCE_HEADERS.DETAIL, targetSheet: 'Opportunities / Activities', targetField: 'OpportunityName / Notes / Description', rule: 'Long text stored in notes and activity description.' },
      { sourceColumn: SOURCE_HEADERS.VALUE, targetSheet: 'Opportunities', targetField: 'EstimatedValue', rule: 'Parsed numeric value; blank becomes 0.' },
      { sourceColumn: SOURCE_HEADERS.OWNER, targetSheet: 'Opportunities / Activities', targetField: 'OwnerUserID / AssignedToUserID', rule: 'Defaults to importing user unless user mapping is later configured.' },
      { sourceColumn: SOURCE_HEADERS.NEXT_STEP, targetSheet: 'Activities', targetField: 'Subject', rule: 'Creates follow-up activity.' }
    ];
  }

  return {
    previewMigrationRows: previewMigrationRows,
    previewMigrationFromSpreadsheet: previewMigrationFromSpreadsheet,
    importMigrationRows: importMigrationRows,
    importMigrationFromSpreadsheet: importMigrationFromSpreadsheet,
    rollbackMigration: rollbackMigration,
    getMigrationMapping: getMigrationMapping
  };
})();
