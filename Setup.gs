var SetupService = (function () {
  function hasBootstrappedUsers() {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return false;
      return DbService.readTable(CRM_CONFIG.SHEETS.USERS).length > 0;
    } catch (err) {
      return false;
    }
  }

  function ensureSheet_(spreadsheet, sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    var requiredHeaders = CRM_CONFIG.HEADERS[sheetName] || [];
    if (requiredHeaders.length === 0) return sheet;

    if (sheet.getMaxRows() < 2) sheet.insertRowsAfter(1, 2 - sheet.getMaxRows());
    if (sheet.getMaxColumns() < requiredHeaders.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredHeaders.length - sheet.getMaxColumns());
    }

    var existingHeaders = DbService.getHeaders(sheet);
    if (existingHeaders.length === 0) {
      sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    } else {
      var mergedHeaders = existingHeaders.slice();
      requiredHeaders.forEach(function (header) {
        if (mergedHeaders.indexOf(header) === -1) mergedHeaders.push(header);
      });
      if (mergedHeaders.length > sheet.getMaxColumns()) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), mergedHeaders.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
    }

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#e8eef7');
    return sheet;
  }

  function setListValidation_(sheetName, columnName, allowedValues) {
    var sheet = DbService.getSheet(sheetName);
    var headers = DbService.getHeaders(sheet);
    var columnIndex = headers.indexOf(columnName) + 1;
    if (columnIndex < 1) return;
    var rowCount = Math.max(1, sheet.getMaxRows() - 1);
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(allowedValues, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, columnIndex, rowCount, 1).setDataValidation(rule);
  }

  function setCheckboxValidation_(sheetName, columnName) {
    var sheet = DbService.getSheet(sheetName);
    var headers = DbService.getHeaders(sheet);
    var columnIndex = headers.indexOf(columnName) + 1;
    if (columnIndex < 1) return;
    var rowCount = Math.max(1, sheet.getMaxRows() - 1);
    sheet.getRange(2, columnIndex, rowCount, 1).insertCheckboxes();
  }

  function applyBasicValidation_() {
    setListValidation_(CRM_CONFIG.SHEETS.USERS, 'Role', [
      CRM_CONFIG.ROLES.ADMIN,
      CRM_CONFIG.ROLES.MANAGER,
      CRM_CONFIG.ROLES.SALES
    ]);
    setCheckboxValidation_(CRM_CONFIG.SHEETS.USERS, 'IsActive');
    setListValidation_(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerType', CRM_CONFIG.CUSTOMER_TYPES);
    setCheckboxValidation_(CRM_CONFIG.SHEETS.CUSTOMERS, 'IsDeleted');
    setListValidation_(
      CRM_CONFIG.SHEETS.PROJECTS,
      'Status',
      CRM_CONFIG.WORKFLOW_DEFAULTS.map(function (state) { return state.StateCode; })
    );
    setListValidation_(CRM_CONFIG.SHEETS.PROJECTS, 'Priority', CRM_CONFIG.PRIORITIES);
    setCheckboxValidation_(CRM_CONFIG.SHEETS.PROJECTS, 'IsDeleted');
    setCheckboxValidation_(CRM_CONFIG.SHEETS.WORKFLOW_STATES, 'IsTerminal');
    setCheckboxValidation_(CRM_CONFIG.SHEETS.WORKFLOW_STATES, 'IsActive');
    setCheckboxValidation_(CRM_CONFIG.SHEETS.CATALOGUES, 'IsActive');
  }

  function seedDefaultSettings_(actorEmail) {
    var existing = {};
    DbService.readTable(CRM_CONFIG.SHEETS.SETTINGS).forEach(function (setting) {
      existing[setting.Key] = setting;
    });
    CRM_CONFIG.DEFAULT_SETTINGS.forEach(function (setting) {
      if (!existing[setting.Key]) {
        DbService.appendRecord(CRM_CONFIG.SHEETS.SETTINGS, {
          Key: setting.Key,
          Value: setting.Value,
          Description: setting.Description,
          UpdatedAt: UtilService.nowIso(),
          UpdatedBy: actorEmail || 'setup'
        });
      }
    });
  }

  function seedWorkflowStates_() {
    var existing = {};
    DbService.readTable(CRM_CONFIG.SHEETS.WORKFLOW_STATES).forEach(function (state) {
      existing[state.StateCode] = state;
    });
    CRM_CONFIG.WORKFLOW_DEFAULTS.forEach(function (state) {
      if (!existing[state.StateCode]) {
        DbService.appendRecord(CRM_CONFIG.SHEETS.WORKFLOW_STATES, state);
      }
    });
  }

  function seedPlaceholderAdmin_() {
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
    if (users.length > 0) return;
    var now = UtilService.nowIso();
    DbService.appendRecord(CRM_CONFIG.SHEETS.USERS, {
      Email: CRM_CONFIG.APP.FIRST_ADMIN_EMAIL,
      Role: CRM_CONFIG.ROLES.ADMIN,
      FullName: 'MATCHPOINT Admin',
      Department: 'Administration',
      IsActive: true,
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: 'setup',
      UpdatedBy: 'setup'
    });
  }

  function setupDatabase(user) {
    var actorEmail = user && user.email ? user.email : 'setup';
    var spreadsheet = DbService.getSpreadsheetForSetup();
    return DbService.withScriptLock(function () {
      Object.keys(CRM_CONFIG.SHEETS).forEach(function (key) {
        ensureSheet_(spreadsheet, CRM_CONFIG.SHEETS[key]);
      });
      seedDefaultSettings_(actorEmail);
      seedWorkflowStates_();
      seedPlaceholderAdmin_();
      applyBasicValidation_();
      UtilService.bumpCacheVersion();
      return {
        spreadsheetId: spreadsheet.getId(),
        spreadsheetUrl: spreadsheet.getUrl(),
        sheets: Object.keys(CRM_CONFIG.SHEETS).map(function (key) {
          return CRM_CONFIG.SHEETS[key];
        })
      };
    });
  }

  function upsertDemoUser_(email, role, name, department, actorEmail) {
    var now = UtilService.nowIso();
    var existing = DbService.findRowById(CRM_CONFIG.SHEETS.USERS, 'Email', email);
    var record = {
      Email: email,
      Role: role,
      FullName: name,
      Department: department,
      IsActive: true,
      UpdatedAt: now,
      UpdatedBy: actorEmail
    };
    if (existing) {
      DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', email, record, null);
      return;
    }
    record.CreatedAt = now;
    record.CreatedBy = actorEmail;
    DbService.appendRecord(CRM_CONFIG.SHEETS.USERS, record);
  }

  function demoDetailsForStatus_(status, index) {
    var values = {
      LEAD_CONTACT: { LeadSource: index % 2 === 0 ? 'Website' : 'Referral' },
      SOLUTION_PRESENTED: { SolutionType: ['Warehouse', 'Inventory', 'Asset', 'Transportation'][index % 4] },
      QUOTATION_PREPARING: { EstimatedValue: 120000 + index * 8000 },
      QUOTATION_SENT: {
        OfferedPrice: 150000 + index * 9000,
        CustomerFeedback: 'Waiting for committee review',
        ExpectedDeliveryDate: '2026-08-' + UtilService.padNumber((index % 20) + 1, 2)
      },
      PROCUREMENT: {
        FinalPrice: 175000 + index * 10000,
        PONumber: 'PO-DEMO-' + UtilService.padNumber(index, 3),
        QuotationNumber: 'QT-DEMO-' + UtilService.padNumber(index, 3),
        ContractStatus: 'กำลังดำเนินงาน'
      },
      COMPLETED: {},
      CANCELLED: { CancelReason: 'Budget deferred' }
    };
    return values[status] || {};
  }

  function ensureDemoCatalogues_(actorEmail) {
    var existing = {};
    DbService.readTable(CRM_CONFIG.SHEETS.CATALOGUES).forEach(function (library) {
      existing[library.LibraryKey] = library;
    });
    var now = UtilService.nowIso();
    [
      {
        LibraryKey: 'product-catalogues',
        DisplayName: 'Product Catalogues',
        FolderId: 'REPLACE_WITH_PRODUCT_CATALOGUE_FOLDER_ID',
        Category: 'Products',
        SortOrder: 10
      },
      {
        LibraryKey: 'solution-documents',
        DisplayName: 'Solution Documents',
        FolderId: 'REPLACE_WITH_SOLUTION_DOCUMENTS_FOLDER_ID',
        Category: 'Solutions',
        SortOrder: 20
      }
    ].forEach(function (library) {
      if (!existing[library.LibraryKey]) {
        library.IsActive = true;
        library.UpdatedAt = now;
        library.UpdatedBy = actorEmail;
        DbService.appendRecord(CRM_CONFIG.SHEETS.CATALOGUES, library);
      }
    });
  }

  function seedDemoData(user) {
    setupDatabase(user);
    var actorEmail = user && user.email ? user.email : CRM_CONFIG.APP.FIRST_ADMIN_EMAIL;
    var result = DbService.withScriptLock(function () {
      upsertDemoUser_('admin@matchpoint.co.th', CRM_CONFIG.ROLES.ADMIN, 'Admin User', 'Management', actorEmail);
      upsertDemoUser_('manager@matchpoint.co.th', CRM_CONFIG.ROLES.MANAGER, 'Manager User', 'Sales Management', actorEmail);
      upsertDemoUser_('sales@matchpoint.co.th', CRM_CONFIG.ROLES.SALES, 'Sales User', 'Sales', actorEmail);

      var now = UtilService.nowIso();
      var customers = DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).filter(function (customer) {
        return !UtilService.asBoolean(customer.IsDeleted);
      });
      var customerTarget = 10;
      for (var i = customers.length; i < customerTarget; i++) {
        var customerId = DbService.generateId('CUST', CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID');
        var customer = {
          CustomerID: customerId,
          CompanyName: 'Demo Customer ' + (i + 1),
          ContactPerson: 'Contact ' + (i + 1),
          Phone: '02-000-' + UtilService.padNumber(i + 1, 4),
          Email: 'customer' + (i + 1) + '@example.com',
          Address: 'Bangkok, Thailand',
          TaxID: '010555' + UtilService.padNumber(i + 1, 7),
          CustomerType: CRM_CONFIG.CUSTOMER_TYPES[i % CRM_CONFIG.CUSTOMER_TYPES.length],
          Industry: ['Logistics', 'Manufacturing', 'Retail', 'Healthcare'][i % 4],
          OwnerEmail: i % 3 === 0 ? 'manager@matchpoint.co.th' : 'sales@matchpoint.co.th',
          Notes: 'Demo CRM customer',
          IsDeleted: false,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: actorEmail,
          UpdatedBy: actorEmail,
          RowVersion: 1
        };
        DbService.appendRecord(CRM_CONFIG.SHEETS.CUSTOMERS, customer);
        customers.push(customer);
      }

      var projects = DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS).filter(function (project) {
        return !UtilService.asBoolean(project.IsDeleted);
      });
      var statuses = CRM_CONFIG.WORKFLOW_DEFAULTS.map(function (state) { return state.StateCode; });
      var projectTarget = 20;
      for (var p = projects.length; p < projectTarget; p++) {
        var status = statuses[p % statuses.length];
        var selectedCustomer = customers[p % customers.length];
        var projectId = DbService.generateId('PRJ', CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID');
        DbService.appendRecord(CRM_CONFIG.SHEETS.PROJECTS, {
          ProjectID: projectId,
          CustomerID: selectedCustomer.CustomerID,
          ProjectName: 'Demo Project ' + (p + 1),
          ResponsibleDept: ['Sales', 'Solution', 'Delivery', 'Support'][p % 4],
          AssignedSalesEmail: p % 4 === 0 ? 'manager@matchpoint.co.th' : 'sales@matchpoint.co.th',
          ProjectValue: 90000 + p * 15000,
          Status: status,
          StatusDetails: UtilService.stringifyJson(demoDetailsForStatus_(status, p + 1)),
          ExpectedCloseDate: '2026-09-' + UtilService.padNumber((p % 25) + 1, 2),
          Priority: CRM_CONFIG.PRIORITIES[p % CRM_CONFIG.PRIORITIES.length],
          Probability: Math.min(95, 20 + (p % 7) * 10),
          Notes: 'Seeded demo opportunity',
          IsDeleted: false,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: actorEmail,
          UpdatedBy: actorEmail,
          RowVersion: 1
        });
      }

      ensureDemoCatalogues_(actorEmail);
      UtilService.bumpCacheVersion();
      return {
        users: DbService.readTable(CRM_CONFIG.SHEETS.USERS).length,
        customers: DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).length,
        projects: DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS).length,
        catalogues: DbService.readTable(CRM_CONFIG.SHEETS.CATALOGUES).length
      };
    });

    AuditService.logAction('SEED_DEMO_DATA', 'Setup', 'DemoData', {}, result, actorEmail, 'seedDemoData');
    return result;
  }

  return {
    hasBootstrappedUsers: hasBootstrappedUsers,
    setupDatabase: setupDatabase,
    seedDemoData: seedDemoData
  };
})();
