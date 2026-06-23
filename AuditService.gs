var AuditService = (function () {
  var SECRET_KEYS = /password|hash|salt|token|secret|key|authorization/i;

  function scrub(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map(scrub);
    }
    if (typeof value === 'object') {
      var output = {};
      Object.keys(value).forEach(function (key) {
        output[key] = SECRET_KEYS.test(key) ? '[redacted]' : scrub(value[key]);
      });
      return output;
    }
    return value;
  }

  function truncateJson(value) {
    var text = UtilService.stringifyJson(scrub(value || {}));
    return text.length > 45000 ? text.slice(0, 45000) + '...TRUNCATED' : text;
  }

  function resolveActor(actor) {
    if (actor && typeof actor === 'object') {
      return {
        userId: actor.userId || actor.UserID || '',
        email: actor.email || actor.Email || ''
      };
    }
    var email = UtilService.coerceEmail(actor || AuthService.getCurrentUserEmail());
    return { userId: '', email: email };
  }

  function logAction(action, entityType, entityId, beforeData, afterData, actor, context, result, errorMessage) {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.AUDIT_LOGS)) return;
      var resolvedActor = resolveActor(actor);
      var record = {
        AuditID: DbService.generateUuid('AUD'),
        Timestamp: UtilService.nowIso(),
        UserID: resolvedActor.userId || '',
        UserEmail: resolvedActor.email || 'unknown',
        Action: action || '',
        EntityType: entityType || '',
        EntityID: entityId || '',
        PreviousValue: truncateJson(beforeData || {}),
        NewValue: truncateJson(afterData || {}),
        RequestID: context || Utilities.getUuid(),
        Result: result || 'SUCCESS',
        ErrorMessage: errorMessage || ''
      };
      DbService.appendRecord(CRM_CONFIG.SHEETS.AUDIT_LOGS, record);
    } catch (err) {
      try {
        Logger.log('Audit logging failed: ' + (err && err.message ? err.message : err));
      } catch (logErr) {
        // Audit logging must never block the primary operation.
      }
    }
  }

  function getAuditLogs(user, filters) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    filters = filters || {};
    var logs = DbService.readTable(CRM_CONFIG.SHEETS.AUDIT_LOGS);
    var query = filters.query || '';
    var action = filters.action || '';
    var actorEmail = filters.actorEmail || '';
    var fromDate = filters.fromDate ? Date.parse(filters.fromDate) : null;
    var toDate = filters.toDate ? Date.parse(filters.toDate + ' 23:59:59') : null;

    logs = logs.filter(function (log) {
      if (action && log.Action !== action) return false;
      if (actorEmail && UtilService.normalize(log.UserEmail) !== UtilService.normalize(actorEmail)) return false;
      var timestamp = Date.parse(log.Timestamp || '') || 0;
      if (fromDate && timestamp < fromDate) return false;
      if (toDate && timestamp > toDate) return false;
      return UtilService.containsText(log, ['AuditID', 'UserEmail', 'Action', 'EntityType', 'EntityID', 'Result'], query);
    });

    logs.sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'Timestamp');
    });

    return UtilService.paginate(logs, filters);
  }

  return {
    logAction: logAction,
    getAuditLogs: getAuditLogs
  };
})();
