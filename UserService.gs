var SettingsService = (function () {
  function getDefaultSettingValue_(key) {
    for (var i = 0; i < CRM_CONFIG.DEFAULT_SETTINGS.length; i++) {
      if (CRM_CONFIG.DEFAULT_SETTINGS[i].Key === key) return CRM_CONFIG.DEFAULT_SETTINGS[i].Value;
    }
    return '';
  }

  function getSettingValue(key) {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.SETTINGS)) return getDefaultSettingValue_(key);
      var settings = DbService.readTable(CRM_CONFIG.SHEETS.SETTINGS);
      for (var i = 0; i < settings.length; i++) {
        if (settings[i].Key === key) return settings[i].Value;
      }
      return getDefaultSettingValue_(key);
    } catch (err) {
      return getDefaultSettingValue_(key);
    }
  }

  function getPublicSettings() {
    return {
      appName: getSettingValue('APP_NAME') || CRM_CONFIG.APP.NAME,
      companyName: getSettingValue('COMPANY_NAME') || CRM_CONFIG.APP.COMPANY_NAME,
      defaultTimezone: getSettingValue('DEFAULT_TIMEZONE') || CRM_CONFIG.APP.DEFAULT_TIMEZONE
    };
  }

  function getSettings(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    return DbService.readTable(CRM_CONFIG.SHEETS.SETTINGS).sort(function (a, b) {
      return String(a.Key).localeCompare(String(b.Key));
    });
  }

  function saveSetting(user, key, value) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    if (UtilService.isBlank(key)) {
      throw UtilService.validationError([{ field: 'Key', message: 'Setting key is required.' }]);
    }
    var normalizedKey = String(key).trim();
    var before = null;
    var after = null;
    DbService.withScriptLock(function () {
      var found = DbService.findRowById(CRM_CONFIG.SHEETS.SETTINGS, 'Key', normalizedKey);
      var patch = {
        Key: normalizedKey,
        Value: value,
        Description: found ? found.record.Description : '',
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      };
      if (found) {
        before = found.record;
        after = DbService.updateRecordById(CRM_CONFIG.SHEETS.SETTINGS, 'Key', normalizedKey, patch, null);
      } else {
        after = DbService.appendRecord(CRM_CONFIG.SHEETS.SETTINGS, patch);
      }
    });
    UtilService.bumpCacheVersion();
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.SAVE_SETTING, 'Setting', normalizedKey, before || {}, after || {}, user.email);
    return after;
  }

  return {
    getSettingValue: getSettingValue,
    getPublicSettings: getPublicSettings,
    getSettings: getSettings,
    saveSetting: saveSetting
  };
})();

var UserService = (function () {
  function sanitizeUser_(userRecord, includeInactive) {
    if (!includeInactive && !UtilService.asBoolean(userRecord.IsActive)) return null;
    return {
      UserID: userRecord.UserID || '',
      Email: UtilService.coerceEmail(userRecord.Email),
      Username: AuthService.normalizeUsername(userRecord.Username),
      Role: userRecord.Role,
      FullName: userRecord.FullName || '',
      Department: userRecord.Department || '',
      IsActive: UtilService.asBoolean(userRecord.IsActive),
      MustChangePassword: UtilService.asBoolean(userRecord.MustChangePassword),
      PasswordUpdatedAt: userRecord.PasswordUpdatedAt || '',
      LastLoginAt: userRecord.LastLoginAt || '',
      CreatedAt: userRecord.CreatedAt || '',
      UpdatedAt: userRecord.UpdatedAt || '',
      CreatedBy: userRecord.CreatedBy || '',
      UpdatedBy: userRecord.UpdatedBy || '',
      RecordVersion: UtilService.toNumber(userRecord.RecordVersion, 0)
    };
  }

  function validateUser_(userData, existingUser) {
    var errors = [];
    var email = UtilService.coerceEmail(userData && userData.Email);
    var username = AuthService.normalizeUsername(userData && userData.Username);
    if (!email || email.indexOf('@') === -1) errors.push({ field: 'Email', message: 'Valid email is required.' });
    if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) {
      errors.push({ field: 'Username', message: 'Username must be 3-40 characters and use letters, numbers, dot, underscore, or dash.' });
    }
    if ([CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER, CRM_CONFIG.ROLES.SALES].indexOf(userData && userData.Role) === -1) {
      errors.push({ field: 'Role', message: 'Role must be Admin, Manager, or Sales.' });
    }
    if ((!existingUser || UtilService.isBlank(existingUser.PasswordHash) || UtilService.isBlank(existingUser.PasswordSalt))
      && UtilService.isBlank(userData.Password)) {
      errors.push({ field: 'Password', message: 'Password is required for new users.' });
    }
    if (errors.length) throw UtilService.validationError(errors);
  }

  function getUsers(user) {
    var includeInactive = AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN]);
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS)
      .map(function (record) { return sanitizeUser_(record, includeInactive); })
      .filter(function (record) {
        if (!record) return false;
        if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER])) return true;
        return record.Email === user.email;
      });
    users.sort(function (a, b) {
      return String(a.FullName || a.Email).localeCompare(String(b.FullName || b.Email));
    });
    return users;
  }

  function activeAdminCount_(excludingEmail) {
    return DbService.readTable(CRM_CONFIG.SHEETS.USERS).filter(function (record) {
      return record.Role === CRM_CONFIG.ROLES.ADMIN
        && UtilService.asBoolean(record.IsActive)
        && !UtilService.asBoolean(record.IsDeleted)
        && UtilService.coerceEmail(record.Email) !== UtilService.coerceEmail(excludingEmail);
    }).length;
  }

  function saveUser(user, userData) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    userData = userData || {};
    var email = UtilService.coerceEmail(userData.Email);
    var username = AuthService.normalizeUsername(userData.Username)
      || AuthService.normalizeUsername(email.split('@')[0]);
    var now = UtilService.nowIso();
    var before = null;
    var after = null;

    DbService.withScriptLock(function () {
      var found = DbService.findRowById(CRM_CONFIG.SHEETS.USERS, 'Email', email);
      validateUser_(userData, found ? found.record : null);
      var usernameOwner = AuthService.getUserByUsername(username);
      if (usernameOwner && UtilService.coerceEmail(usernameOwner.Email) !== email) {
        throw UtilService.validationError([{ field: 'Username', message: 'Username is already in use.' }]);
      }
      if (found && found.record.Role === CRM_CONFIG.ROLES.ADMIN && !UtilService.asBoolean(userData.IsActive) && activeAdminCount_(email) === 0) {
        throw UtilService.validationError([{ field: 'IsActive', message: 'At least one active Admin is required.' }]);
      }
      var patch = {
        UserID: found && !UtilService.isBlank(found.record.UserID) ? found.record.UserID : DbService.generateUuid('USER'),
        Email: email,
        Username: username,
        Role: userData.Role,
        FullName: userData.FullName || '',
        Department: userData.Department || '',
        IsActive: userData.IsActive === undefined ? true : UtilService.asBoolean(userData.IsActive),
        MustChangePassword: userData.MustChangePassword === undefined
          ? (!found || UtilService.isBlank(found.record.PasswordHash))
          : UtilService.asBoolean(userData.MustChangePassword),
        UpdatedAt: now,
        UpdatedBy: user.email,
        IsDeleted: false
      };
      if (!UtilService.isBlank(userData.Password)) {
        var passwordFields = AuthService.makePasswordFields(userData.Password, userData.MustChangePassword);
        Object.keys(passwordFields).forEach(function (key) {
          patch[key] = passwordFields[key];
        });
      }
      if (found) {
        before = found.record;
        after = DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', email, patch, null);
      } else {
        patch.CreatedAt = now;
        patch.CreatedBy = user.email;
        patch.RecordVersion = 1;
        after = DbService.appendRecord(CRM_CONFIG.SHEETS.USERS, patch);
      }
    });

    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.SAVE_USER, 'User', email, before || {}, after || {}, user.email);
    return sanitizeUser_(after, true);
  }

  function deleteUser(user, email) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var targetEmail = UtilService.coerceEmail(email);
    if (!targetEmail) throw UtilService.validationError([{ field: 'Email', message: 'Email is required.' }]);
    var before = null;
    var after = null;

    DbService.withScriptLock(function () {
      var found = DbService.findRowById(CRM_CONFIG.SHEETS.USERS, 'Email', targetEmail);
      if (!found) throw UtilService.notFound('User');
      if (found.record.Role === CRM_CONFIG.ROLES.ADMIN && activeAdminCount_(targetEmail) === 0) {
        throw UtilService.validationError([{ field: 'Email', message: 'At least one active Admin is required.' }]);
      }
      before = found.record;
      after = DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', targetEmail, {
        IsActive: false,
        MustChangePassword: true,
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      }, null);
    });

    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.DELETE_USER, 'User', targetEmail, before || {}, after || {}, user.email);
    return sanitizeUser_(after, true);
  }

  return {
    getUsers: getUsers,
    saveUser: saveUser,
    deleteUser: deleteUser
  };
})();
