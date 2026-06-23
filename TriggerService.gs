var NotificationService = (function () {
  function alreadyExists_(idempotencyKey) {
    return DbService.readTable(CRM_CONFIG.SHEETS.NOTIFICATIONS).some(function (notification) {
      return notification.IdempotencyKey === idempotencyKey;
    });
  }

  function createNotification_(payload) {
    if (alreadyExists_(payload.IdempotencyKey)) return false;
    DbService.appendRecord(CRM_CONFIG.SHEETS.NOTIFICATIONS, {
      NotificationID: DbService.generateUuid('NOTIF'),
      UserID: payload.UserID,
      NotificationType: payload.NotificationType,
      ReferenceType: payload.ReferenceType,
      ReferenceID: payload.ReferenceID,
      Title: payload.Title,
      Message: payload.Message,
      Severity: payload.Severity,
      IsRead: false,
      IdempotencyKey: payload.IdempotencyKey,
      ScheduledAt: payload.ScheduledAt || '',
      SentAt: '',
      CreatedAt: UtilService.nowIso(),
      CreatedBy: 'trigger',
      UpdatedAt: UtilService.nowIso(),
      UpdatedBy: 'trigger'
    });
    return true;
  }

  function generateDueNotifications() {
    var today = Utilities.formatDate(new Date(), UtilService.getTimezone(), 'yyyy-MM-dd');
    var lookahead = UtilService.toNumber(SettingsService.getSettingValue('REMINDER_LOOKAHEAD_DAYS'), 3);
    var maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + lookahead);
    var maxDateText = Utilities.formatDate(maxDate, UtilService.getTimezone(), 'yyyy-MM-dd');
    var created = 0;
    var checked = 0;

    DbService.readTable(CRM_CONFIG.SHEETS.ACTIVITIES).forEach(function (activity) {
      if (UtilService.asBoolean(activity.IsDeleted) || activity.ActivityStatus === 'Completed') return;
      checked += 1;
      var dueDate = String(activity.DueDate || activity.ReminderAt || '');
      if (!dueDate || dueDate > maxDateText) return;
      var severity = dueDate < today ? 'High' : 'Medium';
      if (createNotification_({
        UserID: activity.AssignedToUserID,
        NotificationType: dueDate < today ? 'OVERDUE_ACTIVITY' : 'DUE_ACTIVITY',
        ReferenceType: 'Activities',
        ReferenceID: activity.ActivityID,
        Title: dueDate < today ? 'Overdue follow-up' : 'Upcoming follow-up',
        Message: activity.Subject || 'Follow-up activity',
        Severity: severity,
        ScheduledAt: dueDate,
        IdempotencyKey: 'ACT:' + activity.ActivityID + ':' + dueDate
      })) created += 1;
    });

    DbService.readTable(CRM_CONFIG.SHEETS.INVOICES).forEach(function (invoice) {
      if (UtilService.asBoolean(invoice.IsDeleted) || UtilService.toNumber(invoice.OutstandingAmount, 0) <= 0) return;
      checked += 1;
      var dueDate = String(invoice.DueDate || '');
      if (!dueDate || dueDate > maxDateText) return;
      var ownerUserId = '';
      var customer = DbService.findRowById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', invoice.CustomerID);
      if (customer) ownerUserId = customer.record.OwnerUserID || '';
      if (createNotification_({
        UserID: ownerUserId,
        NotificationType: dueDate < today ? 'OVERDUE_INVOICE' : 'DUE_INVOICE',
        ReferenceType: 'Invoices',
        ReferenceID: invoice.InvoiceID,
        Title: dueDate < today ? 'Overdue invoice' : 'Invoice due soon',
        Message: invoice.InvoiceNumber + ' outstanding ' + invoice.OutstandingAmount,
        Severity: dueDate < today ? 'High' : 'Medium',
        ScheduledAt: dueDate,
        IdempotencyKey: 'INV:' + invoice.InvoiceID + ':' + dueDate
      })) created += 1;
    });

    return { recordsChecked: checked, notificationsCreated: created };
  }

  return {
    generateDueNotifications: generateDueNotifications
  };
})();

var TriggerService = (function () {
  var DAILY_TRIGGER_HANDLER = 'runDailyDigestTrigger';

  function existingTriggers_() {
    return ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === DAILY_TRIGGER_HANDLER;
    });
  }

  function installTriggers(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var existing = existingTriggers_();
    if (!existing.length) {
      ScriptApp.newTrigger(DAILY_TRIGGER_HANDLER).timeBased().everyDays(1).atHour(8).create();
    }
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.INSTALL_TRIGGER, 'Trigger', DAILY_TRIGGER_HANDLER, {}, { installed: true }, user, 'installTriggers');
    return validateTriggers(user);
  }

  function removeTriggers(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var removed = 0;
    existingTriggers_().forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.REMOVE_TRIGGER, 'Trigger', DAILY_TRIGGER_HANDLER, {}, { removed: removed }, user, 'removeTriggers');
    return { removed: removed, triggers: validateTriggers(user).triggers };
  }

  function validateTriggers(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var triggers = existingTriggers_().map(function (trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        source: String(trigger.getTriggerSource())
      };
    });
    return {
      handler: DAILY_TRIGGER_HANDLER,
      installed: triggers.length > 0,
      duplicateCount: Math.max(0, triggers.length - 1),
      triggers: triggers
    };
  }

  function runDailyDigest() {
    var started = UtilService.nowIso();
    var result = { recordsChecked: 0, notificationsCreated: 0, emailsSent: 0, errors: 0 };
    var status = 'PASS';
    try {
      var notificationResult = NotificationService.generateDueNotifications();
      result.recordsChecked = notificationResult.recordsChecked;
      result.notificationsCreated = notificationResult.notificationsCreated;
      if (String(SettingsService.getSettingValue('EMAIL_NOTIFICATIONS_ENABLED')).toLowerCase() === 'true') {
        result.emailsSent = sendAdminDigest_(result);
      }
    } catch (err) {
      status = 'FAIL';
      result.errors = 1;
      result.errorMessage = err && err.message ? err.message : String(err);
    }
    DbService.appendRecord(CRM_CONFIG.SHEETS.TRIGGER_RUNS, {
      TriggerRunID: DbService.generateUuid('TRIG'),
      TriggerName: DAILY_TRIGGER_HANDLER,
      StartedAt: started,
      CompletedAt: UtilService.nowIso(),
      RecordsChecked: result.recordsChecked,
      NotificationsCreated: result.notificationsCreated,
      EmailsSent: result.emailsSent,
      Errors: result.errors,
      Status: status,
      DetailsJson: UtilService.stringifyJson(result)
    });
    return result;
  }

  function sendAdminDigest_(result) {
    var recipient = SettingsService.getSettingValue('ADMIN_ALERT_EMAIL');
    if (!recipient) return 0;
    MailApp.sendEmail({
      to: recipient,
      subject: 'MATCHPOINT CRM Daily Digest',
      body: 'Notifications created: ' + result.notificationsCreated + '\nRecords checked: ' + result.recordsChecked
    });
    return 1;
  }

  return {
    installTriggers: installTriggers,
    removeTriggers: removeTriggers,
    validateTriggers: validateTriggers,
    runDailyDigest: runDailyDigest
  };
})();

function runDailyDigestTrigger() {
  return TriggerService.runDailyDigest();
}
