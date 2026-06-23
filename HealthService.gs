var HealthService = (function () {
  function item(name, status, message, action) {
    return {
      name: name,
      status: status,
      message: message || '',
      recommendedAction: action || ''
    };
  }

  function statusRank_(status) {
    if (status === 'FAIL') return 3;
    if (status === 'WARNING') return 2;
    return 1;
  }

  function summarize_(checks) {
    var worst = checks.reduce(function (current, check) {
      return statusRank_(check.status) > statusRank_(current) ? check.status : current;
    }, 'PASS');
    return {
      status: worst,
      pass: checks.filter(function (check) { return check.status === 'PASS'; }).length,
      warning: checks.filter(function (check) { return check.status === 'WARNING'; }).length,
      fail: checks.filter(function (check) { return check.status === 'FAIL'; }).length
    };
  }

  function healthCheck(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var checks = [];
    var spreadsheet = null;

    try {
      spreadsheet = DbService.getSpreadsheet();
      checks.push(item('Spreadsheet access', 'PASS', spreadsheet.getName()));
    } catch (err) {
      checks.push(item('Spreadsheet access', 'FAIL', err.message, 'Set Script Property SPREADSHEET_ID or bind the script to a Google Sheet.'));
    }

    if (spreadsheet) {
      Object.keys(CRM_CONFIG.HEADERS).forEach(function (sheetName) {
        try {
          DbService.validateRequiredHeaders(sheetName);
          checks.push(item('Sheet ' + sheetName, 'PASS', 'Headers are valid.'));
        } catch (err) {
          checks.push(item('Sheet ' + sheetName, 'FAIL', err.message, 'Run setupDatabase().'));
        }
      });
    }

    try {
      var schemaVersion = SettingsService.getSettingValue('SCHEMA_VERSION');
      checks.push(item('Schema version', schemaVersion === CRM_CONFIG.APP.SCHEMA_VERSION ? 'PASS' : 'WARNING', schemaVersion || 'Missing', 'Run setupDatabase() after code updates.'));
    } catch (err) {
      checks.push(item('Schema version', 'FAIL', err.message, 'Run setupDatabase().'));
    }

    try {
      var props = PropertiesService.getScriptProperties();
      checks.push(item('SPREADSHEET_ID property', props.getProperty('SPREADSHEET_ID') ? 'PASS' : 'WARNING', props.getProperty('SPREADSHEET_ID') ? 'Configured' : 'Using bound spreadsheet fallback.', 'Set SPREADSHEET_ID for deployed web apps.'));
      checks.push(item('Session secret', props.getProperty('CRM_SESSION_SECRET') ? 'PASS' : 'WARNING', props.getProperty('CRM_SESSION_SECRET') ? 'Configured' : 'Generated on first login.', 'Login once or set up database.'));
    } catch (err) {
      checks.push(item('Script properties', 'FAIL', err.message));
    }

    try {
      var folderId = SettingsService.getSettingValue('DRIVE_REPORT_FOLDER_ID');
      if (folderId) DriveApp.getFolderById(folderId).getName();
      checks.push(item('Drive report folder', folderId ? 'PASS' : 'WARNING', folderId ? 'Configured' : 'Reports will be saved to My Drive.', 'Set DRIVE_REPORT_FOLDER_ID in Settings for shared report storage.'));
    } catch (err) {
      checks.push(item('Drive report folder', 'FAIL', err.message, 'Check folder ID and sharing permissions.'));
    }

    try {
      var triggerStatus = TriggerService.validateTriggers(user);
      checks.push(item('Daily trigger', triggerStatus.installed ? 'PASS' : 'WARNING', triggerStatus.installed ? 'Installed' : 'Not installed', 'Run installTriggers().'));
      if (triggerStatus.duplicateCount > 0) {
        checks.push(item('Duplicate triggers', 'WARNING', triggerStatus.duplicateCount + ' duplicate trigger(s).', 'Run removeTriggers(), then installTriggers().'));
      }
    } catch (err) {
      checks.push(item('Trigger status', 'FAIL', err.message));
    }

    try {
      var now = UtilService.nowIso();
      checks.push(item('Timezone', UtilService.getTimezone() === CRM_CONFIG.APP.DEFAULT_TIMEZONE ? 'PASS' : 'WARNING', UtilService.getTimezone() + ' / ' + now, 'Set DEFAULT_TIMEZONE to Asia/Bangkok if required.'));
    } catch (err) {
      checks.push(item('Timezone', 'FAIL', err.message));
    }

    try {
      var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
      var adminCount = users.filter(function (row) {
        return row.Role === CRM_CONFIG.ROLES.ADMIN && UtilService.asBoolean(row.IsActive) && !UtilService.asBoolean(row.IsDeleted);
      }).length;
      checks.push(item('Admin users', adminCount > 0 ? 'PASS' : 'FAIL', adminCount + ' active admin(s).', 'Create at least one active Admin.'));
    } catch (err) {
      checks.push(item('Admin users', 'FAIL', err.message));
    }

    try {
      var auditId = DbService.generateUuid('AUDCHK');
      AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.HEALTH_CHECK, 'Health', auditId, {}, { checkedAt: UtilService.nowIso() }, user, 'healthCheck');
      checks.push(item('Audit log write', 'PASS', 'Audit log accepted a health-check entry.'));
    } catch (err) {
      checks.push(item('Audit log write', 'FAIL', err.message));
    }

    var summary = summarize_(checks);
    return {
      generatedAt: UtilService.nowIso(),
      appVersion: CRM_CONFIG.APP.VERSION,
      schemaVersion: CRM_CONFIG.APP.SCHEMA_VERSION,
      summary: summary,
      checks: checks
    };
  }

  return {
    healthCheck: healthCheck
  };
})();
