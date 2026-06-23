var ReportService = (function () {
  function isDeleted_(record) {
    return UtilService.asBoolean(record.IsDeleted);
  }

  function withinDate_(value, fromDate, toDate) {
    var time = Date.parse(value || '') || 0;
    if (fromDate && time < (Date.parse(fromDate) || 0)) return false;
    if (toDate && time > (Date.parse(toDate + ' 23:59:59') || Number.MAX_SAFE_INTEGER)) return false;
    return true;
  }

  function increment_(target, key, amount) {
    key = key || 'Unknown';
    target[key] = (target[key] || 0) + (amount === undefined ? 1 : amount);
  }

  function filterByAccess_(user, entityName, rows) {
    return rows.filter(function (row) {
      return !isDeleted_(row) && EntityService.canAccessRecord(user, entityName, row);
    });
  }

  function getDashboard(user, filters) {
    filters = filters || {};
    var cachePayload = {
      v: UtilService.getCacheVersion(),
      user: AuthService.isElevated(user) ? 'all' : user.email,
      role: user.role,
      filters: filters
    };
    var cacheKey = UtilService.makeCacheKey('dashboard', cachePayload);
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      // Cache should never block dashboard rendering.
    }

    var customers = filterByAccess_(user, 'customers', DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS));
    var opportunities = filterByAccess_(user, 'opportunities', DbService.readTable(CRM_CONFIG.SHEETS.OPPORTUNITIES)).filter(function (opportunity) {
      if (filters.stage && opportunity.Stage !== filters.stage) return false;
      if (filters.ownerUserId && String(opportunity.OwnerUserID || '') !== String(filters.ownerUserId)) return false;
      return withinDate_(opportunity.ExpectedCloseDate || opportunity.UpdatedAt || opportunity.CreatedAt, filters.fromDate, filters.toDate);
    });
    var activities = filterByAccess_(user, 'activities', DbService.readTable(CRM_CONFIG.SHEETS.ACTIVITIES));
    var invoices = filterByAccess_(user, 'invoices', DbService.readTable(CRM_CONFIG.SHEETS.INVOICES));
    var payments = filterByAccess_(user, 'payments', DbService.readTable(CRM_CONFIG.SHEETS.PAYMENTS));

    var pipelineByStage = {};
    var valueByStage = {};
    var totalPipelineValue = 0;
    var weightedPipelineValue = 0;
    var wonValue = 0;
    var lostValue = 0;
    opportunities.forEach(function (opportunity) {
      var value = UtilService.toNumber(opportunity.EstimatedValue, 0);
      var probability = UtilService.toNumber(opportunity.Probability, 0);
      totalPipelineValue += value;
      weightedPipelineValue += value * probability / 100;
      increment_(pipelineByStage, opportunity.Stage, 1);
      increment_(valueByStage, opportunity.Stage, value);
      if (opportunity.Stage === 'WON') wonValue += value;
      if (opportunity.Stage === 'LOST') lostValue += value;
    });

    var today = Utilities.formatDate(new Date(), UtilService.getTimezone(), 'yyyy-MM-dd');
    var overdueActivities = activities.filter(function (activity) {
      return activity.ActivityStatus !== 'Completed' && activity.DueDate && Date.parse(activity.DueDate) < Date.parse(today);
    });
    var dueTodayActivities = activities.filter(function (activity) {
      return activity.ActivityStatus !== 'Completed' && activity.DueDate === today;
    });
    var overdueInvoices = invoices.filter(function (invoice) {
      return UtilService.toNumber(invoice.OutstandingAmount, 0) > 0 && invoice.DueDate && Date.parse(invoice.DueDate) < Date.parse(today);
    });

    var collectionByMonth = {};
    payments.forEach(function (payment) {
      var month = String(payment.PaymentDate || '').slice(0, 7) || 'Unknown';
      increment_(collectionByMonth, month, UtilService.toNumber(payment.NetReceivedAmount, 0));
    });

    var recentActivities = activities.slice().sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'ActivityDate');
    }).slice(0, 12);
    var topOpportunities = opportunities.slice().sort(function (a, b) {
      return UtilService.toNumber(b.EstimatedValue, 0) - UtilService.toNumber(a.EstimatedValue, 0);
    }).slice(0, 12);

    var dashboard = {
      kpis: {
        customers: customers.length,
        opportunities: opportunities.length,
        totalPipelineValue: totalPipelineValue,
        weightedPipelineValue: weightedPipelineValue,
        wonValue: wonValue,
        lostValue: lostValue,
        openActivities: activities.filter(function (activity) { return activity.ActivityStatus !== 'Completed'; }).length,
        overdueActivities: overdueActivities.length,
        overdueInvoices: overdueInvoices.length,
        outstandingAmount: invoices.reduce(function (sum, invoice) { return sum + UtilService.toNumber(invoice.OutstandingAmount, 0); }, 0),
        collectedAmount: payments.reduce(function (sum, payment) { return sum + UtilService.toNumber(payment.NetReceivedAmount, 0); }, 0)
      },
      pipelineByStage: pipelineByStage,
      valueByStage: valueByStage,
      collectionByMonth: collectionByMonth,
      dueTodayActivities: dueTodayActivities.slice(0, 10),
      overdueActivities: overdueActivities.slice(0, 10),
      overdueInvoices: overdueInvoices.slice(0, 10),
      recentActivities: recentActivities,
      topOpportunities: topOpportunities,
      generatedAt: UtilService.nowIso()
    };

    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(dashboard), CRM_CONFIG.CACHE.DASHBOARD_TTL_SECONDS);
    } catch (err) {
      // Cache write failures are non-fatal.
    }
    return dashboard;
  }

  function reportRows_(user, reportType, filters) {
    filters = filters || {};
    if (reportType === 'pipeline') {
      var opportunities = EntityService.listRecords(user, 'opportunities', {
        page: 1,
        pageSize: 1000,
        query: filters.query || '',
        fromDate: filters.fromDate || '',
        toDate: filters.toDate || '',
        ownerUserId: filters.ownerUserId || '',
        status: filters.stage || ''
      }).items;
      return {
        headers: ['OpportunityCode', 'OpportunityName', 'CustomerID', 'Stage', 'Probability', 'EstimatedValue', 'ExpectedCloseDate', 'OwnerUserID'],
        rows: opportunities
      };
    }
    if (reportType === 'collections') {
      var invoices = EntityService.listRecords(user, 'invoices', {
        page: 1,
        pageSize: 1000,
        query: filters.query || '',
        fromDate: filters.fromDate || '',
        toDate: filters.toDate || ''
      }).items;
      return {
        headers: ['InvoiceNumber', 'CustomerID', 'InvoiceDate', 'DueDate', 'GrandTotal', 'PaidAmount', 'OutstandingAmount', 'PaymentStatus'],
        rows: invoices
      };
    }
    if (reportType === 'activities') {
      var activities = EntityService.listRecords(user, 'activities', {
        page: 1,
        pageSize: 1000,
        query: filters.query || '',
        fromDate: filters.fromDate || '',
        toDate: filters.toDate || '',
        ownerUserId: filters.ownerUserId || ''
      }).items;
      return {
        headers: ['ActivityDate', 'DueDate', 'ActivityType', 'Subject', 'ActivityStatus', 'Priority', 'CustomerID', 'OpportunityID', 'AssignedToUserID'],
        rows: activities
      };
    }
    throw UtilService.validationError([{ field: 'reportType', message: 'Invalid report type.' }]);
  }

  function getReport(user, reportType, filters) {
    var table = reportRows_(user, reportType || 'pipeline', filters || {});
    var totals = {};
    table.headers.forEach(function (header) {
      totals[header] = table.rows.reduce(function (sum, row) {
        return sum + (typeof row[header] === 'number' ? row[header] : 0);
      }, 0);
    });
    return {
      reportType: reportType || 'pipeline',
      headers: table.headers,
      rows: table.rows,
      totals: totals,
      generatedAt: UtilService.nowIso()
    };
  }

  function escapeExportValue_(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && /^[=+\-@]/.test(value.trim())) return "'" + value.trim();
    return value;
  }

  function exportReportXlsx(user, reportType, filters) {
    var report = getReport(user, reportType, filters);
    var spreadsheet = SpreadsheetApp.create('MATCHPOINT CRM ' + report.reportType + ' Export ' + UtilService.nowIso());
    var sheet = spreadsheet.getSheets()[0];
    sheet.setName('Report');
    sheet.getRange(1, 1, 1, report.headers.length).setValues([report.headers]);
    var values = report.rows.map(function (row) {
      return report.headers.map(function (header) {
        return escapeExportValue_(row[header]);
      });
    });
    if (values.length) sheet.getRange(2, 1, values.length, report.headers.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, report.headers.length).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.autoResizeColumns(1, report.headers.length);

    var blob = DriveApp.getFileById(spreadsheet.getId()).getBlob().getAs(MimeType.MICROSOFT_EXCEL);
    blob.setName('MATCHPOINT_CRM_' + report.reportType + '_' + Utilities.formatDate(new Date(), UtilService.getTimezone(), 'yyyyMMdd_HHmm') + '.xlsx');
    var folderId = SettingsService.getSettingValue('DRIVE_REPORT_FOLDER_ID');
    var file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);
    DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);

    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.EXPORT, 'Report', report.reportType, {}, { fileId: file.getId(), rows: report.rows.length }, user, 'exportReportXlsx');
    return {
      fileId: file.getId(),
      fileName: file.getName(),
      url: file.getUrl(),
      rows: report.rows.length
    };
  }

  return {
    getDashboard: getDashboard,
    getReport: getReport,
    exportReportXlsx: exportReportXlsx
  };
})();
