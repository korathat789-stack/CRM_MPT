var AuthService = (function () {
  function getCurrentUserEmail() {
    try {
      return UtilService.coerceEmail(Session.getActiveUser().getEmail());
    } catch (err) {
      return '';
    }
  }

  function getUserByEmail(email) {
    var normalized = UtilService.coerceEmail(email);
    if (!normalized || !DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return null;
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      if (UtilService.coerceEmail(users[i].Email) === normalized) return users[i];
    }
    return null;
  }

  function isDomainAllowed(email) {
    var domain = SettingsService.getSettingValue('ALLOWED_DOMAIN') || CRM_CONFIG.APP.ALLOWED_DOMAIN;
    if (!domain) return true;
    return UtilService.normalize(email).slice(-('@' + domain).length) === '@' + UtilService.normalize(domain);
  }

  function accessDenied(email, reason) {
    AuditService.logAction(
      CRM_CONFIG.AUDIT_ACTIONS.ACCESS_DENIED,
      'Auth',
      email || 'unknown',
      {},
      { reason: reason || 'Access denied' },
      email || 'unknown',
      reason || ''
    );
    throw UtilService.createError(
      CRM_CONFIG.ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to access MATCHPOINT CRM.'
    );
  }

  function requireAuth() {
    var email = getCurrentUserEmail();
    if (!email) accessDenied('unknown', 'Empty active user email');
    if (!isDomainAllowed(email)) accessDenied(email, 'Outside allowed domain');

    var user = getUserByEmail(email);
    if (!user) accessDenied(email, 'User not found');
    if (!UtilService.asBoolean(user.IsActive)) accessDenied(email, 'Inactive user');

    return {
      email: UtilService.coerceEmail(user.Email),
      role: user.Role,
      fullName: user.FullName || '',
      department: user.Department || '',
      raw: user
    };
  }

  function hasRole(user, roles) {
    roles = Array.isArray(roles) ? roles : [roles];
    return !!user && roles.indexOf(user.role) !== -1;
  }

  function assertPermission(user, roles) {
    if (!hasRole(user, roles)) {
      accessDenied(user && user.email, 'Role not permitted');
    }
  }

  function isElevated(user) {
    return hasRole(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER]);
  }

  function canAccessProject(user, project) {
    if (!user || !project || UtilService.asBoolean(project.IsDeleted)) return false;
    if (isElevated(user)) return true;
    return UtilService.coerceEmail(project.AssignedSalesEmail) === user.email;
  }

  function canAccessCustomer(user, customer) {
    if (!user || !customer || UtilService.asBoolean(customer.IsDeleted)) return false;
    if (isElevated(user)) return true;
    if (UtilService.coerceEmail(customer.OwnerEmail) === user.email) return true;

    var projects = DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS);
    return projects.some(function (project) {
      return !UtilService.asBoolean(project.IsDeleted)
        && project.CustomerID === customer.CustomerID
        && UtilService.coerceEmail(project.AssignedSalesEmail) === user.email;
    });
  }

  return {
    getCurrentUserEmail: getCurrentUserEmail,
    getUserByEmail: getUserByEmail,
    requireAuth: requireAuth,
    hasRole: hasRole,
    assertPermission: assertPermission,
    isElevated: isElevated,
    canAccessCustomer: canAccessCustomer,
    canAccessProject: canAccessProject
  };
})();
