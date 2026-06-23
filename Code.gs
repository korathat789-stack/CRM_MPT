function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.appName = CRM_CONFIG.APP.NAME;
  return template
    .evaluate()
    .setTitle(CRM_CONFIG.APP.NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  var allowed = ['Styles', 'App'];
  if (allowed.indexOf(filename) === -1) return '';
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function runRpc_(sessionToken, handler, options) {
  options = options || {};
  try {
    var user = options.allowAnonymous ? null : AuthService.requireAuth(sessionToken);
    return UtilService.success(handler(user));
  } catch (err) {
    return UtilService.handleError(err);
  }
}

function runSetupRpc_(sessionToken, handler) {
  try {
    var user = null;
    if (SetupService.hasUsableAdminCredentials()) {
      user = AuthService.requireAuth(sessionToken);
      AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    }
    return UtilService.success(handler(user));
  } catch (err) {
    return UtilService.handleError(err);
  }
}

function login(username, password) {
  try {
    return UtilService.success(AuthService.login(username, password));
  } catch (err) {
    return UtilService.handleError(err);
  }
}

function logout(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.LOGOUT, 'Auth', user.email, {}, {}, user, 'logout');
    return { signedOut: true };
  });
}

function getAuthData(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return {
      user: user,
      settings: SettingsService.getPublicSettings(),
      permissions: {
        canViewAll: AuthService.isElevated(user),
        canManageUsers: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canManageSettings: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canViewAuditLogs: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canDeleteRecords: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canRunMigration: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER]),
        canRunTests: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN])
      },
      schemas: EntityService.getEntitySchemas(user),
      lookups: EntityService.getLookups(user)
    };
  });
}

function listEntity(sessionToken, entityName, filters) {
  return runRpc_(sessionToken, function (user) {
    return EntityService.listRecords(user, entityName, filters || {});
  });
}

function getEntity(sessionToken, entityName, id) {
  return runRpc_(sessionToken, function (user) {
    return EntityService.getRecord(user, entityName, id);
  });
}

function saveEntity(sessionToken, entityName, record) {
  return runRpc_(sessionToken, function (user) {
    return EntityService.saveRecord(user, entityName, record || {});
  });
}

function deleteEntity(sessionToken, entityName, id) {
  return runRpc_(sessionToken, function (user) {
    return EntityService.deleteRecord(user, entityName, id);
  });
}

function restoreEntity(sessionToken, entityName, id) {
  return runRpc_(sessionToken, function (user) {
    return EntityService.restoreRecord(user, entityName, id);
  });
}

function getDashboard(sessionToken, filters) {
  return runRpc_(sessionToken, function (user) {
    return ReportService.getDashboard(user, filters || {});
  });
}

function getReport(sessionToken, reportType, filters) {
  return runRpc_(sessionToken, function (user) {
    return ReportService.getReport(user, reportType || 'pipeline', filters || {});
  });
}

function exportReportXlsx(sessionToken, reportType, filters) {
  return runRpc_(sessionToken, function (user) {
    return ReportService.exportReportXlsx(user, reportType || 'pipeline', filters || {});
  });
}

function previewMigrationRows(sessionToken, rows, options) {
  return runRpc_(sessionToken, function (user) {
    return MigrationService.previewMigrationRows(user, rows || [], options || {});
  });
}

function importMigrationRows(sessionToken, rows, options) {
  return runRpc_(sessionToken, function (user) {
    return MigrationService.importMigrationRows(user, rows || [], options || {});
  });
}

function previewMigrationFromSpreadsheet(sessionToken, sourceSpreadsheetId, sourceSheetName) {
  return runRpc_(sessionToken, function (user) {
    return MigrationService.previewMigrationFromSpreadsheet(user, sourceSpreadsheetId, sourceSheetName);
  });
}

function importMigrationFromSpreadsheet(sessionToken, sourceSpreadsheetId, sourceSheetName) {
  return runRpc_(sessionToken, function (user) {
    return MigrationService.importMigrationFromSpreadsheet(user, sourceSpreadsheetId, sourceSheetName);
  });
}

function rollbackMigration(sessionToken, migrationRunId) {
  return runRpc_(sessionToken, function (user) {
    return MigrationService.rollbackMigration(user, migrationRunId);
  });
}

function getMigrationMapping(sessionToken) {
  return runRpc_(sessionToken, function () {
    return MigrationService.getMigrationMapping();
  });
}

function getCatalogues(sessionToken) {
  return runRpc_(sessionToken, function () {
    return DriveLibraryService.getConfiguredLibraries();
  });
}

function getCatalogueFiles(sessionToken, libraryKey) {
  return runRpc_(sessionToken, function (user) {
    return DriveLibraryService.getLibraryFiles(user, libraryKey);
  });
}

function healthCheck(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return HealthService.healthCheck(user);
  });
}

function installTriggers(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return TriggerService.installTriggers(user);
  });
}

function removeTriggers(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return TriggerService.removeTriggers(user);
  });
}

function validateTriggers(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return TriggerService.validateTriggers(user);
  });
}

function runAllTests(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return TestService.runAllTests(user);
  });
}

function getUsers(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return UserService.getUsers(user);
  });
}

function saveUser(sessionToken, userData) {
  return runRpc_(sessionToken, function (user) {
    return UserService.saveUser(user, userData || {});
  });
}

function deleteUser(sessionToken, email) {
  return runRpc_(sessionToken, function (user) {
    return UserService.deleteUser(user, email);
  });
}

function getSettings(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return SettingsService.getSettings(user);
  });
}

function saveSetting(sessionToken, key, value) {
  return runRpc_(sessionToken, function (user) {
    return SettingsService.saveSetting(user, key, value);
  });
}

function getAuditLogs(sessionToken, filters) {
  return runRpc_(sessionToken, function (user) {
    return AuditService.getAuditLogs(user, filters || {});
  });
}

function setupDatabase(sessionToken, adminEmail, adminUsername, adminPassword) {
  return runSetupRpc_(sessionToken, function (user) {
    return SetupService.setupDatabase(user, adminEmail, adminUsername, adminPassword);
  });
}

function seedDemoData(sessionToken) {
  return runRpc_(sessionToken, function (user) {
    return SetupService.seedDemoData(user);
  });
}

function setupDatabaseFromEditor() {
  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty('BOOTSTRAP_ADMIN_EMAIL') || AuthService.getCurrentUserEmail();
  if (!email || email.indexOf('@') === -1) {
    throw new Error('Could not detect your Google account email. Set Script Property BOOTSTRAP_ADMIN_EMAIL to your email, then run setupDatabaseFromEditor() again.');
  }
  // Auto-generate the bootstrap password if one was not supplied, so first-time
  // setup works without any manual Script Property configuration.
  var password = props.getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  if (!password) {
    password = 'Mpt-' + Utilities.getUuid().slice(0, 10);
    props.setProperty('BOOTSTRAP_ADMIN_PASSWORD', password);
  }

  var result = SetupService.setupDatabase(null, email, CRM_CONFIG.APP.BOOTSTRAP_ADMIN_USERNAME, password);

  Logger.log('==================== MATCHPOINT CRM SETUP COMPLETE ====================');
  Logger.log('Database spreadsheet : ' + result.spreadsheetUrl);
  Logger.log('Spreadsheet ID       : ' + result.spreadsheetId);
  Logger.log('Sheets created       : ' + result.sheets.length);
  Logger.log('Admin email          : ' + result.bootstrapAdminEmail);
  Logger.log('Admin username       : ' + result.bootstrapAdminUsername);
  Logger.log('Admin password       : ' + password);
  if (result.warnings && result.warnings.length) {
    Logger.log('Validation warnings  : ' + result.warnings.join(' | '));
  }
  Logger.log('Open the spreadsheet URL above to confirm the data, then sign in to the web app.');
  Logger.log('======================================================================');
  return result;
}

function seedDemoDataFromEditor() {
  var admin = AuthService.getUserByEmail(AuthService.getCurrentUserEmail());
  if (!admin) throw new Error('Sign in once as an Admin before running seedDemoDataFromEditor().');
  return SetupService.seedDemoData({
    userId: admin.UserID,
    email: admin.Email,
    username: admin.Username,
    role: admin.Role,
    raw: admin
  }, true);
}

function getEditorAdminUser_() {
  var admin = AuthService.getUserByEmail(AuthService.getCurrentUserEmail());
  if (!admin || admin.Role !== CRM_CONFIG.ROLES.ADMIN || !UtilService.asBoolean(admin.IsActive)) {
    throw new Error('The active Google account must exist as an active Admin user before running this editor helper.');
  }
  return {
    userId: admin.UserID,
    email: admin.Email,
    username: admin.Username,
    role: admin.Role,
    fullName: admin.FullName || admin.Email,
    raw: admin
  };
}

function healthCheckFromEditor() {
  return HealthService.healthCheck(getEditorAdminUser_());
}

function runAllTestsFromEditor() {
  return TestService.runAllTests(getEditorAdminUser_());
}

function installTriggersFromEditor() {
  return TriggerService.installTriggers(getEditorAdminUser_());
}

function createUserLoginFromEditor(email, username, password, role, fullName, department) {
  return UserService.saveUser(getEditorAdminUser_(), {
    Email: email,
    Username: username,
    Password: password,
    Role: role || CRM_CONFIG.ROLES.SALES,
    FullName: fullName || '',
    Department: department || '',
    IsActive: true,
    MustChangePassword: true
  });
}
