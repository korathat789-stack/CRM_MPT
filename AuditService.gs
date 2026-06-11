var AuditService = (function () {
  function truncate(value) {
    var text = UtilService.stringifyJson(value);
    return text.length > 45000 ? text.slice(0, 45000) + '...TRUNCATED' : text;
  }

  function logAction(action, entityType, entityId, beforeData, afterData, actorEmail, context) {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.AUDIT_LOGS)) return;
      DbService.withScriptLock(function () {
        DbService.appendRecord(CRM_CONFIG.SHEETS.AUDIT_LOGS, {
          AuditID: DbService.generateId('AUD', CRM_CONFIG.SHEETS.AUDIT_LOGS, 'AuditID'),
          Timestamp: UtilService.nowIso(),
          ActorEmail: actorEmail || AuthService.getCurrentUserEmail() || 'unknown',
          Action: action,
          EntityType: entityType || '',
          EntityID: entityId || '',
          BeforeJson: truncate(beforeData || {}),
          AfterJson: truncate(afterData || {}),
          IpOrContext: context || ''
        });
      });
    } catch (err) {
      try {
        Logger.log('Audit logging failed: ' + (err && err.message ? err.message : err));
      } catch (logErr) {
        // Ignore audit logging failures.
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
      if (actorEmail && UtilService.normalize(log.ActorEmail) !== UtilService.normalize(actorEmail)) return false;
      var timestamp = Date.parse(log.Timestamp || '') || 0;
      if (fromDate && timestamp < fromDate) return false;
      if (toDate && timestamp > toDate) return false;
      return UtilService.containsText(log, ['AuditID', 'ActorEmail', 'Action', 'EntityType', 'EntityID'], query);
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
