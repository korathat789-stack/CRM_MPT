var SetupService = (function () {
  var VALIDATION_ROW_COUNT = 500;
  var SETUP_LOCK_TIMEOUT_MS = 120000;

  function hasBootstrappedUsers() {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return false;
      return DbService.readTable(CRM_CONFIG.SHEETS.USERS).some(function (user) {
        return !UtilService.asBoolean(user.IsDeleted);
      });
    } catch (err) {
      return false;
    }
  }

  function hasUsableAdminCredentials() {
    try {
      if (!DbService.sheetExists(CRM_CONFIG.SHEETS.USERS)) return false;
      return DbService.readTable(CRM_CONFIG.SHEETS.USERS).some(function (user) {
        return user.Role === CRM_CONFIG.ROLES.ADMIN
          && UtilService.asBoolean(user.IsActive)
          && !UtilService.asBoolean(user.IsDeleted)
          && !UtilService.isBlank(user.Username)
          && !UtilService.isBlank(user.PasswordHash)
          && !UtilService.isBlank(user.PasswordSalt);
      });
    } catch (err) {
      return false;
    }
  }

  function normalizeBootstrap_(email, username, password) {
    var activeEmail = AuthService.getCurrentUserEmail();
    var normalizedEmail = UtilService.coerceEmail(email || PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_EMAIL') || activeEmail);
    var normalizedUsername = AuthService.normalizeUsername(username || PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_USERNAME') || CRM_CONFIG.APP.BOOTSTRAP_ADMIN_USERNAME);
    if (!normalizedEmail || normalizedEmail.indexOf('@') === -1) {
      throw UtilService.validationError([{ field: 'AdminEmail', message: 'Admin email is required for first setup.' }]);
    }
    if (!normalizedUsername) {
      throw UtilService.validationError([{ field: 'Username', message: 'Admin username is required for first setup.' }]);
    }
    if (UtilService.isBlank(password) && !hasUsableAdminCredentials()) {
      throw UtilService.validationError([{ field: 'Password', message: 'Admin password is required for first setup.' }]);
    }
    return {
      email: normalizedEmail,
      username: normalizedUsername,
      password: password || ''
    };
  }

  function ensureSheet_(spreadsheet, sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    var requiredHeaders = CRM_CONFIG.HEADERS[sheetName] || [];
    if (!requiredHeaders.length) return sheet;

    if (sheet.getMaxRows() < 2) sheet.insertRowsAfter(1, 2 - sheet.getMaxRows());
    if (sheet.getMaxColumns() < requiredHeaders.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredHeaders.length - sheet.getMaxColumns());
    }

    var existingHeaders = DbService.getHeaders(sheet);
    var mergedHeaders = existingHeaders.length ? existingHeaders.slice() : [];
    requiredHeaders.forEach(function (header) {
      if (mergedHeaders.indexOf(header) === -1) mergedHeaders.push(header);
    });
    if (mergedHeaders.length > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), mergedHeaders.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, mergedHeaders.length)
      .setFontWeight('bold')
      .setFontColor('#ffffff')
      .setBackground('#0f172a')
      .setWrap(true);
    // Column auto-sizing is cosmetic and occasionally slow; never let it block setup.
    try {
      sheet.autoResizeColumns(1, Math.min(mergedHeaders.length, 12));
    } catch (resizeErr) {
      // Ignore – headers and data are already written.
    }
    return sheet;
  }

  function setListValidation_(sheetName, columnName, allowedValues) {
    if (!allowedValues || !allowedValues.length) return;
    var sheet = DbService.getSheet(sheetName);
    var headers = DbService.getHeaders(sheet);
    var columnIndex = headers.indexOf(columnName) + 1;
    if (columnIndex < 1) return;
    if (sheet.getMaxRows() < VALIDATION_ROW_COUNT + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), VALIDATION_ROW_COUNT + 1 - sheet.getMaxRows());
    }
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(allowedValues, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, columnIndex, VALIDATION_ROW_COUNT, 1).setDataValidation(rule);
  }

  function setCheckboxValidation_(sheetName, columnName) {
    var sheet = DbService.getSheet(sheetName);
    var headers = DbService.getHeaders(sheet);
    var columnIndex = headers.indexOf(columnName) + 1;
    if (columnIndex < 1) return;
    if (sheet.getMaxRows() < VALIDATION_ROW_COUNT + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), VALIDATION_ROW_COUNT + 1 - sheet.getMaxRows());
    }
    var rule = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();
    sheet.getRange(2, columnIndex, VALIDATION_ROW_COUNT, 1).setDataValidation(rule);
  }

  function applyValidations_() {
    var warnings = [];
    function safe(task) {
      try {
        task();
      } catch (err) {
        warnings.push(err && err.message ? err.message : String(err));
      }
    }

    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.USERS, 'Role', [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER, CRM_CONFIG.ROLES.SALES]); });
    safe(function () { setCheckboxValidation_(CRM_CONFIG.SHEETS.USERS, 'IsActive'); });
    safe(function () { setCheckboxValidation_(CRM_CONFIG.SHEETS.USERS, 'MustChangePassword'); });
    safe(function () { setCheckboxValidation_(CRM_CONFIG.SHEETS.USERS, 'IsDeleted'); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerType', CRM_CONFIG.CUSTOMER_TYPES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerStatus', CRM_CONFIG.CUSTOMER_STATUSES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.OPPORTUNITIES, 'Stage', CRM_CONFIG.PIPELINE_STAGES.map(function (stage) { return stage.StageCode; })); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.ACTIVITIES, 'ActivityType', CRM_CONFIG.ACTIVITY_TYPES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.ACTIVITIES, 'ActivityStatus', CRM_CONFIG.ACTIVITY_STATUSES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.ACTIVITIES, 'Priority', CRM_CONFIG.PRIORITIES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.QUOTATIONS, 'Status', CRM_CONFIG.DOCUMENT_STATUSES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.SALES_ORDERS, 'OrderStatus', CRM_CONFIG.ORDER_STATUSES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.INVOICES, 'InvoiceStatus', CRM_CONFIG.INVOICE_STATUSES); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentMethod', CRM_CONFIG.PAYMENT_METHODS); });
    safe(function () { setListValidation_(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentStatus', CRM_CONFIG.PAYMENT_STATUSES); });
    Object.keys(CRM_CONFIG.HEADERS).forEach(function (sheetName) {
      if (CRM_CONFIG.HEADERS[sheetName].indexOf('IsDeleted') !== -1) {
        safe(function () { setCheckboxValidation_(sheetName, 'IsDeleted'); });
      }
    });
    return warnings;
  }

  function seedSettings_(actorEmail) {
    var existing = {};
    DbService.readTable(CRM_CONFIG.SHEETS.SETTINGS).forEach(function (setting) {
      existing[setting.Key] = true;
    });
    var now = UtilService.nowIso();
    var records = [];
    CRM_CONFIG.DEFAULT_SETTINGS.forEach(function (setting) {
      if (!existing[setting.Key]) {
        records.push({
          Key: setting.Key,
          Value: setting.Value,
          Description: setting.Description,
          UpdatedAt: now,
          UpdatedBy: actorEmail || 'setup'
        });
      }
    });
    if (records.length) DbService.appendRecords(CRM_CONFIG.SHEETS.SETTINGS, records);
  }

  function seedPipelineStages_() {
    var existing = {};
    DbService.readTable(CRM_CONFIG.SHEETS.PIPELINE_STAGES).forEach(function (stage) {
      existing[stage.StageCode] = true;
    });
    var records = [];
    CRM_CONFIG.PIPELINE_STAGES.forEach(function (stage) {
      if (!existing[stage.StageCode]) records.push(stage);
    });
    if (records.length) DbService.appendRecords(CRM_CONFIG.SHEETS.PIPELINE_STAGES, records);
  }

  function makeAdminRecord_(bootstrap, actorEmail, existing) {
    var now = UtilService.nowIso();
    var record = {
      UserID: existing && existing.UserID ? existing.UserID : DbService.generateUuid('USER'),
      Email: bootstrap.email,
      Username: bootstrap.username,
      FullName: existing && existing.FullName ? existing.FullName : 'MATCHPOINT Admin',
      Role: CRM_CONFIG.ROLES.ADMIN,
      Department: existing && existing.Department ? existing.Department : 'Administration',
      ManagerUserID: '',
      IsActive: true,
      MustChangePassword: true,
      LastLoginAt: existing && existing.LastLoginAt ? existing.LastLoginAt : '',
      CreatedAt: existing && existing.CreatedAt ? existing.CreatedAt : now,
      CreatedBy: existing && existing.CreatedBy ? existing.CreatedBy : actorEmail || 'setup',
      UpdatedAt: now,
      UpdatedBy: actorEmail || 'setup',
      RecordVersion: existing && existing.RecordVersion ? Number(existing.RecordVersion) : 1,
      IsDeleted: false
    };
    if (!existing || !existing.PasswordHash || bootstrap.password) {
      var passwordFields = AuthService.makePasswordFields(bootstrap.password, true);
      Object.keys(passwordFields).forEach(function (key) {
        record[key] = passwordFields[key];
      });
    }
    return record;
  }

  function seedBootstrapAdmin_(bootstrap, actorEmail) {
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.USERS, 'Email', bootstrap.email);
    var record = makeAdminRecord_(bootstrap, actorEmail, found ? found.record : null);
    if (found) {
      DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', bootstrap.email, record, null);
    } else {
      DbService.appendRecord(CRM_CONFIG.SHEETS.USERS, record);
    }
  }

  function setupDatabase(user, bootstrapEmail, bootstrapUsername, bootstrapPassword) {
    var actorEmail = user && user.email ? user.email : AuthService.getCurrentUserEmail() || 'setup';
    var bootstrap = normalizeBootstrap_(bootstrapEmail, bootstrapUsername, bootstrapPassword);

    // Phase 1 (locked, fast, atomic): resolve the spreadsheet, build every sheet,
    // and seed the essential rows (settings, pipeline stages, bootstrap admin).
    // Spreadsheet resolution happens INSIDE the lock so concurrent setup runs can
    // never create duplicate "MATCHPOINT CRM Database" files.
    var result = DbService.withScriptLock(function () {
      var spreadsheet = DbService.getSpreadsheetForSetup();
      Object.keys(CRM_CONFIG.HEADERS).forEach(function (sheetName) {
        ensureSheet_(spreadsheet, sheetName);
      });
      seedSettings_(actorEmail);
      seedPipelineStages_();
      seedBootstrapAdmin_(bootstrap, actorEmail);
      UtilService.bumpCacheVersion();
      SpreadsheetApp.flush();
      return {
        spreadsheetId: spreadsheet.getId(),
        spreadsheetUrl: spreadsheet.getUrl(),
        schemaVersion: CRM_CONFIG.APP.SCHEMA_VERSION,
        sheets: Object.keys(CRM_CONFIG.HEADERS),
        warnings: [],
        bootstrapAdminEmail: bootstrap.email,
        bootstrapAdminUsername: bootstrap.username
      };
    }, SETUP_LOCK_TIMEOUT_MS);

    // Phase 2 (unlocked, best-effort): data-validation dropdowns/checkboxes are
    // cosmetic. Running them outside the lock keeps the locked section short and
    // guarantees the database is fully usable even if this pass is slow or fails.
    try {
      result.warnings = applyValidations_();
    } catch (validationErr) {
      result.warnings = [validationErr && validationErr.message ? validationErr.message : String(validationErr)];
    }

    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.UPDATE, 'Setup', 'Database', {}, { sheets: result.sheets.length }, user || actorEmail, 'setupDatabase');
    return result;
  }

  function upsertDemoUser_(seedKey, username, role, fullName, department, managerUserId, actorEmail) {
    var email = seedKey + '@matchpoint.demo';
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.USERS, 'Email', email);
    var now = UtilService.nowIso();
    var password = PropertiesService.getScriptProperties().getProperty('DEMO_USER_PASSWORD');
    if (!password) {
      password = 'Demo-' + Utilities.getUuid().slice(0, 8);
      PropertiesService.getScriptProperties().setProperty('DEMO_USER_PASSWORD', password);
    }
    var record = {
      UserID: found ? found.record.UserID : DbService.generateUuid('USER'),
      Email: email,
      Username: username,
      FullName: fullName,
      Role: role,
      Department: department,
      ManagerUserID: managerUserId || '',
      IsActive: true,
      MustChangePassword: true,
      LastLoginAt: found ? found.record.LastLoginAt : '',
      CreatedAt: found ? found.record.CreatedAt : now,
      CreatedBy: found ? found.record.CreatedBy : actorEmail,
      UpdatedAt: now,
      UpdatedBy: actorEmail,
      RecordVersion: found ? Number(found.record.RecordVersion || 1) : 1,
      IsDeleted: false
    };
    if (!found || !found.record.PasswordHash) {
      var passwordFields = AuthService.makePasswordFields(password, true);
      Object.keys(passwordFields).forEach(function (key) { record[key] = passwordFields[key]; });
    }
    if (found) DbService.updateRecordById(CRM_CONFIG.SHEETS.USERS, 'Email', email, record, null);
    else DbService.appendRecord(CRM_CONFIG.SHEETS.USERS, record);
    return record;
  }

  function demoDate_(offsetDays) {
    var date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return Utilities.formatDate(date, UtilService.getTimezone(), 'yyyy-MM-dd');
  }

  function countDemo_(sheetName, keyField, prefix) {
    return DbService.readTable(sheetName).filter(function (record) {
      return String(record[keyField] || '').indexOf(prefix) === 0;
    }).length;
  }

  function appendDemoRecords_(sheetName, keyField, prefix, targetCount, factory) {
    var existing = countDemo_(sheetName, keyField, prefix);
    var records = [];
    for (var i = existing; i < targetCount; i++) {
      records.push(factory(i + 1));
    }
    if (records.length) DbService.appendRecords(sheetName, records);
    return existing + records.length;
  }

  function seedDemoData(user, skipSetup) {
    if (!skipSetup && !hasUsableAdminCredentials()) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.SHEET_ERROR, 'Run setupDatabase() before seeding demo data.');
    }
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var actorEmail = user.email;
    var now = UtilService.nowIso();

    return DbService.withScriptLock(function () {
      var admin = upsertDemoUser_('admin', 'admin.demo', CRM_CONFIG.ROLES.ADMIN, 'Demo Admin', 'Administration', '', actorEmail);
      var manager = upsertDemoUser_('manager', 'manager.demo', CRM_CONFIG.ROLES.MANAGER, 'Demo Manager', 'Sales Management', admin.UserID, actorEmail);
      var salesUsers = [];
      for (var u = 1; u <= 8; u++) {
        salesUsers.push(upsertDemoUser_('sales' + u, 'sales' + u + '.demo', CRM_CONFIG.ROLES.SALES, 'Demo Sales ' + u, 'Sales', manager.UserID, actorEmail));
      }
      var allSales = [manager].concat(salesUsers);

      var customerCount = appendDemoRecords_(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', 'DEMO-CUST-', 300, function (index) {
        var owner = allSales[index % allSales.length];
        return {
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(index, 4),
          CustomerCode: 'CUST-202606-' + UtilService.padNumber(index, 4),
          CustomerType: CRM_CONFIG.CUSTOMER_TYPES[index % CRM_CONFIG.CUSTOMER_TYPES.length],
          CompanyNameTH: 'ลูกค้าทดสอบ ' + index,
          CompanyNameEN: 'Demo Customer ' + index,
          TaxID: '0105566' + UtilService.padNumber(index, 6),
          BranchCode: index % 5 === 0 ? '00001' : '00000',
          Industry: ['Manufacturing', 'Logistics', 'Retail', 'Healthcare', 'Education'][index % 5],
          Website: '',
          Phone: '02-100-' + UtilService.padNumber(index, 4),
          Email: 'customer' + index + '@example.test',
          LINE: '',
          Address: 'Bangkok',
          Province: 'Bangkok',
          PostalCode: '10110',
          CustomerSource: ['Website', 'Referral', 'Event', 'LINE'][index % 4],
          CustomerStatus: 'Active',
          OwnerUserID: owner.UserID,
          CreditTermDays: [0, 15, 30, 45][index % 4],
          CreditLimit: 50000 + index * 1000,
          Notes: 'Demo customer record',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false,
          ExternalSourceKey: ''
        };
      });

      var contactCount = appendDemoRecords_(CRM_CONFIG.SHEETS.CONTACTS, 'ContactID', 'DEMO-CONT-', 500, function (index) {
        return {
          ContactID: 'DEMO-CONT-' + UtilService.padNumber(index, 4),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          Prefix: index % 2 ? 'Khun' : '',
          FirstName: 'Contact',
          LastName: String(index),
          Position: ['Owner', 'Manager', 'Purchasing', 'Operations'][index % 4],
          Department: ['Management', 'Procurement', 'IT', 'Operations'][index % 4],
          Phone: '',
          Mobile: '08' + UtilService.padNumber(index, 8),
          Email: 'contact' + index + '@example.test',
          LINE: '',
          IsPrimary: index % 3 === 0,
          Notes: '',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var stages = CRM_CONFIG.PIPELINE_STAGES.map(function (stage) { return stage.StageCode; });
      var opportunityCount = appendDemoRecords_(CRM_CONFIG.SHEETS.OPPORTUNITIES, 'OpportunityID', 'DEMO-OPP-', 500, function (index) {
        var stage = stages[index % stages.length];
        var owner = allSales[index % allSales.length];
        return {
          OpportunityID: 'DEMO-OPP-' + UtilService.padNumber(index, 4),
          OpportunityCode: 'OPP-202606-' + UtilService.padNumber(index, 4),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          ContactID: 'DEMO-CONT-' + UtilService.padNumber(((index - 1) % 500) + 1, 4),
          OpportunityName: 'Demo Opportunity ' + index,
          Source: ['Website', 'Referral', 'Event', 'Existing customer'][index % 4],
          OwnerUserID: owner.UserID,
          Stage: stage,
          Probability: CRM_CONFIG.PIPELINE_STAGES.filter(function (item) { return item.StageCode === stage; })[0].Probability,
          EstimatedValue: 25000 + index * 750,
          ExpectedCloseDate: demoDate_((index % 90) - 20),
          LastContactDate: demoDate_(-1 * (index % 30)),
          NextFollowUpDate: demoDate_((index % 14) - 5),
          ProductCategory: ['RFID', 'Warehouse', 'Asset', 'Software'][index % 4],
          Competitor: index % 7 === 0 ? 'Competitor ' + (index % 4) : '',
          LostReason: stage === 'LOST' ? 'Budget deferred' : '',
          Notes: 'Demo opportunity',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false,
          ExternalSourceKey: ''
        };
      });

      var activityCount = appendDemoRecords_(CRM_CONFIG.SHEETS.ACTIVITIES, 'ActivityID', 'DEMO-ACT-', 1500, function (index) {
        var owner = allSales[index % allSales.length];
        return {
          ActivityID: 'DEMO-ACT-' + UtilService.padNumber(index, 5),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          ContactID: 'DEMO-CONT-' + UtilService.padNumber(((index - 1) % 500) + 1, 4),
          OpportunityID: 'DEMO-OPP-' + UtilService.padNumber(((index - 1) % 500) + 1, 4),
          ActivityType: CRM_CONFIG.ACTIVITY_TYPES[index % CRM_CONFIG.ACTIVITY_TYPES.length],
          Subject: 'Demo follow-up ' + index,
          Description: 'Demo activity timeline entry',
          ActivityDate: demoDate_(-1 * (index % 60)),
          DueDate: demoDate_((index % 20) - 10),
          CompletedDate: index % 4 === 0 ? demoDate_(-1 * (index % 8)) : '',
          ActivityStatus: index % 4 === 0 ? 'Completed' : (index % 9 === 0 ? 'Overdue' : 'Open'),
          Priority: CRM_CONFIG.PRIORITIES[index % CRM_CONFIG.PRIORITIES.length],
          AssignedToUserID: owner.UserID,
          ReminderAt: demoDate_((index % 7) - 3),
          Outcome: index % 4 === 0 ? 'Completed' : '',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false,
          ExternalSourceKey: ''
        };
      });

      var productCount = appendDemoRecords_(CRM_CONFIG.SHEETS.PRODUCTS, 'ProductID', 'DEMO-PROD-', 100, function (index) {
        return {
          ProductID: 'DEMO-PROD-' + UtilService.padNumber(index, 4),
          ProductCode: 'PROD-202606-' + UtilService.padNumber(index, 4),
          ProductName: 'Demo Product ' + index,
          ProductCategory: ['RFID', 'Hardware', 'Software', 'Service'][index % 4],
          Description: 'Demo product',
          Unit: index % 3 === 0 ? 'License' : 'Unit',
          StandardPrice: 1500 + index * 100,
          CostPrice: 900 + index * 60,
          IsActive: true,
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var quotationCount = appendDemoRecords_(CRM_CONFIG.SHEETS.QUOTATIONS, 'QuotationID', 'DEMO-QUO-', 300, function (index) {
        var subtotal = 30000 + index * 900;
        var vat = Math.round(subtotal * 0.07);
        return {
          QuotationID: 'DEMO-QUO-' + UtilService.padNumber(index, 4),
          QuotationNumber: 'QT-202606-' + UtilService.padNumber(index, 4),
          Version: 1 + (index % 3),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          OpportunityID: 'DEMO-OPP-' + UtilService.padNumber(((index - 1) % 500) + 1, 4),
          IssueDate: demoDate_(-1 * (index % 45)),
          ExpiryDate: demoDate_((index % 30) + 1),
          Status: CRM_CONFIG.DOCUMENT_STATUSES[index % CRM_CONFIG.DOCUMENT_STATUSES.length],
          Currency: 'THB',
          Subtotal: subtotal,
          Discount: 0,
          VAT: vat,
          WithholdingTax: 0,
          GrandTotal: subtotal + vat,
          TermsAndConditions: 'Demo quotation terms',
          ApprovedByUserID: index % 5 === 0 ? manager.UserID : '',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var salesOrderCount = appendDemoRecords_(CRM_CONFIG.SHEETS.SALES_ORDERS, 'SalesOrderID', 'DEMO-SO-', 200, function (index) {
        var subtotal = 40000 + index * 1000;
        var vat = Math.round(subtotal * 0.07);
        return {
          SalesOrderID: 'DEMO-SO-' + UtilService.padNumber(index, 4),
          SalesOrderNumber: 'SO-202606-' + UtilService.padNumber(index, 4),
          CustomerPONumber: 'PO-DEMO-' + UtilService.padNumber(index, 4),
          PODate: demoDate_(-1 * (index % 40)),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          OpportunityID: 'DEMO-OPP-' + UtilService.padNumber(((index - 1) % 500) + 1, 4),
          QuotationID: 'DEMO-QUO-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          OrderStatus: CRM_CONFIG.ORDER_STATUSES[index % CRM_CONFIG.ORDER_STATUSES.length],
          DeliveryDate: demoDate_((index % 60) - 10),
          Subtotal: subtotal,
          Discount: 0,
          VAT: vat,
          GrandTotal: subtotal + vat,
          DeliveryStatus: index % 3 === 0 ? 'Delivered' : 'In Progress',
          InvoiceStatus: index % 4 === 0 ? 'Issued' : 'Draft',
          PaymentStatus: index % 5 === 0 ? 'Paid' : 'Partially Paid',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var invoiceCount = appendDemoRecords_(CRM_CONFIG.SHEETS.INVOICES, 'InvoiceID', 'DEMO-INV-', 250, function (index) {
        var subtotal = 45000 + index * 800;
        var vat = Math.round(subtotal * 0.07);
        var grandTotal = subtotal + vat;
        var paid = index % 3 === 0 ? grandTotal : (index % 3 === 1 ? Math.round(grandTotal / 2) : 0);
        return {
          InvoiceID: 'DEMO-INV-' + UtilService.padNumber(index, 4),
          InvoiceNumber: 'INV-202606-' + UtilService.padNumber(index, 4),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          SalesOrderID: 'DEMO-SO-' + UtilService.padNumber(((index - 1) % 200) + 1, 4),
          InvoiceDate: demoDate_(-1 * (index % 50)),
          DueDate: demoDate_((index % 45) - 20),
          InvoiceStatus: paid >= grandTotal ? 'Paid' : (Date.parse(demoDate_((index % 45) - 20)) < Date.now() ? 'Overdue' : 'Issued'),
          Subtotal: subtotal,
          Discount: 0,
          VAT: vat,
          WithholdingTax: 0,
          GrandTotal: grandTotal,
          PaidAmount: paid,
          OutstandingAmount: Math.max(0, grandTotal - paid),
          PaymentStatus: paid >= grandTotal ? 'Paid' : (paid > 0 ? 'Partially Paid' : 'Issued'),
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var paymentCount = appendDemoRecords_(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentID', 'DEMO-PAY-', 300, function (index) {
        var received = 20000 + index * 650;
        var fee = index % 8 === 0 ? 25 : 0;
        var withholding = index % 6 === 0 ? Math.round(received * 0.03) : 0;
        var net = received - fee - withholding;
        return {
          PaymentID: 'DEMO-PAY-' + UtilService.padNumber(index, 4),
          ReceiptNumber: 'RCPT-202606-' + UtilService.padNumber(index, 4),
          CustomerID: 'DEMO-CUST-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          PaymentDate: demoDate_(-1 * (index % 45)),
          PaymentMethod: CRM_CONFIG.PAYMENT_METHODS[index % CRM_CONFIG.PAYMENT_METHODS.length],
          BankReference: 'BANK-DEMO-' + UtilService.padNumber(index, 4),
          ReceivedAmount: received,
          BankFee: fee,
          WithholdingTaxAmount: withholding,
          NetReceivedAmount: net,
          UnallocatedAmount: index % 4 === 0 ? Math.round(net / 4) : 0,
          PaymentStatus: index % 4 === 0 ? 'Partially Allocated' : 'Allocated',
          Notes: 'Demo payment',
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      var allocationCount = appendDemoRecords_(CRM_CONFIG.SHEETS.PAYMENT_ALLOCATIONS, 'AllocationID', 'DEMO-ALLOC-', 500, function (index) {
        return {
          AllocationID: 'DEMO-ALLOC-' + UtilService.padNumber(index, 5),
          PaymentID: 'DEMO-PAY-' + UtilService.padNumber(((index - 1) % 300) + 1, 4),
          InvoiceID: 'DEMO-INV-' + UtilService.padNumber(((index - 1) % 250) + 1, 4),
          InvoiceItemID: '',
          SalesOrderItemID: '',
          AllocatedAmount: 10000 + index * 100,
          AllocatedAt: demoDate_(-1 * (index % 30)),
          AllocatedBy: actorEmail,
          CreatedAt: now,
          CreatedBy: actorEmail,
          UpdatedAt: now,
          UpdatedBy: actorEmail,
          RecordVersion: 1,
          IsDeleted: false
        };
      });

      UtilService.bumpCacheVersion();
      var result = {
        users: DbService.readTable(CRM_CONFIG.SHEETS.USERS).length,
        customers: customerCount,
        contacts: contactCount,
        opportunities: opportunityCount,
        activities: activityCount,
        products: productCount,
        quotations: quotationCount,
        salesOrders: salesOrderCount,
        invoices: invoiceCount,
        payments: paymentCount,
        paymentAllocations: allocationCount
      };
      AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.UPDATE, 'Setup', 'DemoData', {}, result, user, 'seedDemoData');
      return result;
    });
  }

  return {
    hasBootstrappedUsers: hasBootstrappedUsers,
    hasUsableAdminCredentials: hasUsableAdminCredentials,
    setupDatabase: setupDatabase,
    seedDemoData: seedDemoData
  };
})();
