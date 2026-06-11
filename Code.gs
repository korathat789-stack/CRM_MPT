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

function runRpc_(handler) {
  try {
    var user = AuthService.requireAuth();
    return UtilService.success(handler(user));
  } catch (err) {
    return UtilService.handleError(err);
  }
}

function runSetupRpc_(handler) {
  try {
    var user = null;
    if (SetupService.hasBootstrappedUsers()) {
      user = AuthService.requireAuth();
      AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    }
    return UtilService.success(handler(user), 'OK');
  } catch (err) {
    return UtilService.handleError(err);
  }
}

function getAuthData() {
  return runRpc_(function (user) {
    return {
      user: user,
      settings: SettingsService.getPublicSettings(),
      permissions: {
        canViewAll: AuthService.isElevated(user),
        canManageUsers: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canManageSettings: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canViewAuditLogs: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]),
        canDeleteRecords: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN])
      },
      customerTypes: CRM_CONFIG.CUSTOMER_TYPES,
      priorities: CRM_CONFIG.PRIORITIES,
      statusFieldConfig: CRM_CONFIG.STATUS_FIELD_CONFIG,
      workflowStates: ProjectService.getWorkflowStates()
    };
  });
}

function searchCustomers(query, options) {
  return runRpc_(function (user) {
    return CustomerService.searchCustomers(user, query, options);
  });
}

function getCustomer(customerId) {
  return runRpc_(function (user) {
    return CustomerService.getCustomer(user, customerId);
  });
}

function saveCustomer(customerData) {
  return runRpc_(function (user) {
    return CustomerService.saveCustomer(user, customerData);
  });
}

function deleteCustomer(customerId) {
  return runRpc_(function (user) {
    return CustomerService.deleteCustomer(user, customerId);
  });
}

function searchProjects(filters, pagination) {
  return runRpc_(function (user) {
    return ProjectService.searchProjects(user, filters, pagination);
  });
}

function getProject(projectId) {
  return runRpc_(function (user) {
    return ProjectService.getProject(user, projectId);
  });
}

function saveProject(projectData) {
  return runRpc_(function (user) {
    return ProjectService.saveProject(user, projectData);
  });
}

function deleteProject(projectId) {
  return runRpc_(function (user) {
    return ProjectService.deleteProject(user, projectId);
  });
}

function getDashboard(filters) {
  return runRpc_(function (user) {
    return DashboardService.getDashboard(user, filters);
  });
}

function getWorkflowStates() {
  return runRpc_(function () {
    return ProjectService.getWorkflowStates();
  });
}

function getLibraryFiles(libraryKey) {
  return runRpc_(function (user) {
    return DriveLibraryService.getLibraryFiles(user, libraryKey);
  });
}

function getConfiguredLibraries() {
  return runRpc_(function () {
    return DriveLibraryService.getConfiguredLibraries();
  });
}

function getUsers() {
  return runRpc_(function (user) {
    return UserService.getUsers(user);
  });
}

function saveUser(userData) {
  return runRpc_(function (user) {
    return UserService.saveUser(user, userData);
  });
}

function deleteUser(email) {
  return runRpc_(function (user) {
    return UserService.deleteUser(user, email);
  });
}

function getSettings() {
  return runRpc_(function (user) {
    return SettingsService.getSettings(user);
  });
}

function saveSetting(key, value) {
  return runRpc_(function (user) {
    return SettingsService.saveSetting(user, key, value);
  });
}

function getAuditLogs(filters) {
  return runRpc_(function (user) {
    return AuditService.getAuditLogs(user, filters);
  });
}

function setupDatabase() {
  return runSetupRpc_(function (user) {
    return SetupService.setupDatabase(user);
  });
}

function seedDemoData() {
  return runRpc_(function (user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    return SetupService.seedDemoData(user);
  });
}
