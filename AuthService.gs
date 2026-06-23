var AuthService = (function () {
  var SESSION_TTL_SECONDS = 8 * 60 * 60;

  function getCurrentUserEmail() {
    try {
      return UtilService.coerceEmail(Session.getActiveUser().getEmail());
    } catch (err) {
      return '';
    }
  }

  function base64UrlEncode_(value) {
    var bytes = typeof value === 'string'
      ? Utilities.newBlob(value).getBytes()
      : value;
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  }

  function base64UrlDecodeText_(value) {
    var padded = String(value || '');
    while (padded.length % 4 !== 0) padded += '=';
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
  }

  function getSessionSecret_() {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('CRM_SESSION_SECRET');
    if (!secret) {
      secret = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
      properties.setProperty('CRM_SESSION_SECRET', secret);
    }
    return secret;
  }

  function sign_(message) {
    return base64UrlEncode_(Utilities.computeHmacSha256Signature(message, getSessionSecret_()));
  }

  function timingSafeEqual_(left, right) {
    left = String(left || '');
    right = String(right || '');
    if (left.length !== right.length) return false;
    var diff = 0;
    for (var i = 0; i < left.length; i++) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
  }

  function normalizeUsername(username) {
    return UtilService.normalize(username);
  }

  function getUserByEmail(email) {
    var normalized = UtilService.coerceEmail(email);
    if (!normalized || !DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return null;
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      if (!UtilService.asBoolean(users[i].IsDeleted) && UtilService.coerceEmail(users[i].Email) === normalized) return users[i];
    }
    return null;
  }

  function getUserByUsername(username) {
    var normalized = normalizeUsername(username);
    if (!normalized || !DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return null;
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      if (!UtilService.asBoolean(users[i].IsDeleted) && normalizeUsername(users[i].Username) === normalized) return users[i];
    }
    return null;
  }

  function getUsersByUsername_(username) {
    var normalized = normalizeUsername(username);
    if (!normalized || !DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return [];
    return DbService.readTable(CRM_CONFIG.SHEETS.USERS).filter(function (user) {
      return !UtilService.asBoolean(user.IsDeleted) && normalizeUsername(user.Username) === normalized;
    });
  }

  function createPasswordSalt() {
    return Utilities.getUuid() + Utilities.getUuid();
  }

  function hashPassword(password, salt) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(salt || '') + ':' + String(password || ''),
      Utilities.Charset.UTF_8
    );
    return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
  }

  function validatePasswordPolicy(password) {
    var errors = [];
    if (UtilService.isBlank(password)) {
      errors.push({ field: 'Password', message: 'Password is required.' });
    } else if (String(password).length < 8) {
      errors.push({ field: 'Password', message: 'Password must be at least 8 characters.' });
    }
    if (errors.length) throw UtilService.validationError(errors);
  }

  function makePasswordFields(password, mustChangePassword) {
    validatePasswordPolicy(password);
    var salt = createPasswordSalt();
    return {
      PasswordHash: hashPassword(password, salt),
      PasswordSalt: salt,
      MustChangePassword: mustChangePassword === undefined ? false : UtilService.asBoolean(mustChangePassword),
      PasswordUpdatedAt: UtilService.nowIso()
    };
  }

  function verifyPassword_(user, password) {
    if (!user || UtilService.isBlank(user.PasswordHash) || UtilService.isBlank(user.PasswordSalt)) return false;
    var attempted = hashPassword(password, user.PasswordSalt);
    return timingSafeEqual_(attempted, user.PasswordHash);
  }

  function publicUser_(user) {
    return {
      userId: user.UserID || '',
      email: UtilService.coerceEmail(user.Email),
      username: normalizeUsername(user.Username),
      role: user.Role,
      fullName: user.FullName || '',
      department: user.Department || '',
      mustChangePassword: UtilService.asBoolean(user.MustChangePassword),
      raw: {
        UserID: user.UserID || '',
        Email: UtilService.coerceEmail(user.Email),
        Username: normalizeUsername(user.Username),
        Role: user.Role,
        FullName: user.FullName || '',
        Department: user.Department || '',
        IsActive: UtilService.asBoolean(user.IsActive)
      }
    };
  }

  function issueSession_(user) {
    var nowSeconds = Math.floor(Date.now() / 1000);
    var payload = {
      u: normalizeUsername(user.Username),
      e: UtilService.coerceEmail(user.Email),
      p: String(user.PasswordUpdatedAt || ''),
      iat: nowSeconds,
      exp: nowSeconds + SESSION_TTL_SECONDS,
      n: Utilities.getUuid()
    };
    var body = base64UrlEncode_(JSON.stringify(payload));
    return body + '.' + sign_(body);
  }

  function parseSessionToken_(sessionToken) {
    if (UtilService.isBlank(sessionToken)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Please sign in to MATCHPOINT CRM.');
    }
    var parts = String(sessionToken).split('.');
    if (parts.length !== 2 || !timingSafeEqual_(sign_(parts[0]), parts[1])) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Your session is invalid. Please sign in again.');
    }
    var payload = UtilService.safeJsonParse(base64UrlDecodeText_(parts[0]), null);
    if (!payload || !payload.u || !payload.exp) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Your session is invalid. Please sign in again.');
    }
    if (Number(payload.exp) < Math.floor(Date.now() / 1000)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Your session has expired. Please sign in again.');
    }
    return payload;
  }

  function accessDenied(username, reason) {
    AuditService.logAction(
      CRM_CONFIG.AUDIT_ACTIONS.ACCESS_DENIED,
      'Auth',
      username || 'unknown',
      {},
      { reason: reason || 'Access denied' },
      username || 'unknown',
      reason || ''
    );
    throw UtilService.createError(
      CRM_CONFIG.ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to access MATCHPOINT CRM.'
    );
  }

  function requireAuth(sessionToken) {
    var payload = parseSessionToken_(sessionToken);
    var user = getUserByEmail(payload.e);
    if (!user) accessDenied(payload.u, 'User not found');
    if (!UtilService.asBoolean(user.IsActive)) accessDenied(payload.u, 'Inactive user');
    if (normalizeUsername(user.Username) !== normalizeUsername(payload.u)
      || UtilService.coerceEmail(user.Email) !== UtilService.coerceEmail(payload.e)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Your session is stale. Please sign in again.');
    }
    if (String(user.PasswordUpdatedAt || '') !== String(payload.p || '')) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED, 'Your password changed. Please sign in again.');
    }
    return publicUser_(user);
  }

  function login(username, password) {
    var normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || UtilService.isBlank(password)) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED,
        'Invalid username or password.'
      );
    }

    var candidates = getUsersByUsername_(normalizedUsername);
    var user = null;
    for (var i = 0; i < candidates.length; i++) {
      if (!UtilService.asBoolean(candidates[i].IsDeleted)
        && UtilService.asBoolean(candidates[i].IsActive)
        && verifyPassword_(candidates[i], password)) {
        user = candidates[i];
        break;
      }
    }
    if (!user) {
      AuditService.logAction(
        CRM_CONFIG.AUDIT_ACTIONS.ACCESS_DENIED,
        'Auth',
        normalizedUsername,
        {},
        { reason: 'Invalid username or password' },
        normalizedUsername,
        'login'
      );
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.UNAUTHENTICATED,
        'Invalid username or password.'
      );
    }

    var token = issueSession_(user);
    DbService.withScriptLock(function () {
      DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', user.Email, {
        LastLoginAt: UtilService.nowIso(),
        UpdatedAt: user.UpdatedAt || UtilService.nowIso(),
        UpdatedBy: user.UpdatedBy || 'login'
      }, null);
    });
    return {
      sessionToken: token,
      expiresInSeconds: SESSION_TTL_SECONDS,
      user: publicUser_(user)
    };
  }

  function hasRole(user, roles) {
    roles = Array.isArray(roles) ? roles : [roles];
    return !!user && roles.indexOf(user.role) !== -1;
  }

  function assertPermission(user, roles) {
    if (!hasRole(user, roles)) {
      accessDenied(user && (user.username || user.email), 'Role not permitted');
    }
  }

  function isElevated(user) {
    return hasRole(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER]);
  }

  return {
    getCurrentUserEmail: getCurrentUserEmail,
    getUserByEmail: getUserByEmail,
    getUserByUsername: getUserByUsername,
    normalizeUsername: normalizeUsername,
    hashPassword: hashPassword,
    makePasswordFields: makePasswordFields,
    requireAuth: requireAuth,
    login: login,
    hasRole: hasRole,
    assertPermission: assertPermission,
    isElevated: isElevated
  };
})();
