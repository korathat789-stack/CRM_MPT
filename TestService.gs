var TestService = (function () {
  function pass(name, startedAt, details) {
    return {
      name: name,
      status: 'PASS',
      durationMs: Date.now() - startedAt,
      details: details || ''
    };
  }

  function fail(name, startedAt, err) {
    return {
      name: name,
      status: 'FAIL',
      durationMs: Date.now() - startedAt,
      details: err && err.message ? err.message : String(err)
    };
  }

  function runTest_(name, fn) {
    var startedAt = Date.now();
    try {
      var details = fn();
      return pass(name, startedAt, details);
    } catch (err) {
      return fail(name, startedAt, err);
    }
  }

  function assert_(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  function makeSyntheticUser_(role) {
    return {
      userId: 'TEST-USER-' + role,
      email: 'test.' + String(role).toLowerCase() + '@example.test',
      username: 'test.' + String(role).toLowerCase(),
      role: role,
      fullName: 'Test ' + role,
      raw: { UserID: 'TEST-USER-' + role, Email: 'test.' + String(role).toLowerCase() + '@example.test', Role: role }
    };
  }

  function runUnitTests(user) {
    var tests = [];
    tests.push(runTest_('Formula injection prefix', function () {
      assert_(EntityService.sanitizeValue('=HYPERLINK("x")').charAt(0) === "'", 'Formula-like value was not prefixed.');
    }));
    tests.push(runTest_('Pipeline stage map', function () {
      assert_(CRM_CONFIG.SOURCE_STAGE_MAP['ใบเสนอราคา'] === 'QUOTATION', 'Thai quotation status mapping missing.');
    }));
    tests.push(runTest_('Password hashing', function () {
      var fields = AuthService.makePasswordFields('StrongPass123', true);
      assert_(fields.PasswordHash && fields.PasswordSalt, 'Password hash fields missing.');
    }));
    tests.push(runTest_('Document total calculation', function () {
      var invoice = EntityService.saveRecord(user, 'invoices', {
        CustomerID: ensureTestCustomer_(user).CustomerID,
        InvoiceDate: '2026-06-19',
        DueDate: '2026-06-30',
        InvoiceStatus: 'Issued',
        Subtotal: 1000,
        Discount: 100,
        VAT: 63,
        WithholdingTax: 0
      });
      assert_(Number(invoice.GrandTotal) === 963, 'Grand total calculation mismatch.');
      EntityService.deleteRecord(user, 'invoices', invoice.InvoiceID);
    }));
    return tests;
  }

  function ensureTestCustomer_(user) {
    var existing = DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).filter(function (customer) {
      return customer.ExternalSourceKey === 'TEST-CUSTOMER' && !UtilService.asBoolean(customer.IsDeleted);
    })[0];
    if (existing) return existing;
    return EntityService.saveRecord(user, 'customers', {
      CompanyNameTH: 'Test Customer',
      CustomerType: 'เอกชน',
      CustomerStatus: 'Active',
      OwnerUserID: user.userId || (user.raw && user.raw.UserID),
      ExternalSourceKey: 'TEST-CUSTOMER'
    });
  }

  function runIntegrationTests(user) {
    var tests = [];
    tests.push(runTest_('Database sheets and headers', function () {
      Object.keys(CRM_CONFIG.HEADERS).forEach(function (sheetName) {
        DbService.validateRequiredHeaders(sheetName);
      });
      return Object.keys(CRM_CONFIG.HEADERS).length + ' sheet(s) validated.';
    }));
    tests.push(runTest_('Customer CRUD', function () {
      var customer = EntityService.saveRecord(user, 'customers', {
        CompanyNameTH: 'Integration Customer ' + Utilities.getUuid().slice(0, 8),
        CustomerType: 'เอกชน',
        CustomerStatus: 'Active',
        OwnerUserID: user.userId || (user.raw && user.raw.UserID)
      });
      var loaded = EntityService.getRecord(user, 'customers', customer.CustomerID);
      assert_(loaded.CustomerID === customer.CustomerID, 'Customer read failed.');
      loaded.Notes = 'Updated by test';
      var updated = EntityService.saveRecord(user, 'customers', loaded);
      assert_(updated.Notes === 'Updated by test', 'Customer update failed.');
      EntityService.deleteRecord(user, 'customers', customer.CustomerID);
      return customer.CustomerID;
    }));
    tests.push(runTest_('Migration preview', function () {
      var result = MigrationService.previewMigrationRows(user, [{
        'วันที่ติดต่อ': '2026-06-19',
        'ชื่อลูกค้า': 'Preview Customer',
        'ประเภท': 'เอกชน',
        'สถานะโครงการ': 'ใบเสนอราคา',
        'รายละเอียดงาน/Hardware': 'RFID demo',
        'มูลค่าโครงการ': 10000,
        'ผู้รับผิดชอบ': '',
        'สิ่งที่ต้องทำต่อ (Next Step)': 'Call back'
      }], { sourceWorkbook: 'test', sourceSheet: 'test' });
      assert_(result.rowsValid === 1, 'Migration preview should be valid.');
    }));
    return tests;
  }

  function runPermissionTests(user) {
    var tests = [];
    tests.push(runTest_('Sales cannot delete records', function () {
      var sales = makeSyntheticUser_(CRM_CONFIG.ROLES.SALES);
      var denied = false;
      try {
        EntityService.deleteRecord(sales, 'customers', 'missing');
      } catch (err) {
        denied = err.code === CRM_CONFIG.ERROR_CODES.ACCESS_DENIED;
      }
      assert_(denied, 'Sales delete should be denied.');
    }));
    tests.push(runTest_('Sales cannot view product cost', function () {
      var sales = makeSyntheticUser_(CRM_CONFIG.ROLES.SALES);
      var products = EntityService.listRecords(sales, 'products', { page: 1, pageSize: 10 });
      if (products.items.length) assert_(products.items[0].CostPrice === undefined, 'CostPrice leaked to Sales.');
    }));
    return tests;
  }

  function runExportTests(user) {
    var tests = [];
    tests.push(runTest_('Report generation', function () {
      var report = ReportService.getReport(user, 'pipeline', { pageSize: 25 });
      assert_(report.headers.length > 0, 'Report headers missing.');
    }));
    return tests;
  }

  function runSecurityTests(user) {
    var tests = [];
    tests.push(runTest_('XSS stored as text', function () {
      var sanitized = EntityService.sanitizeValue('<img src=x onerror=alert(1)>');
      assert_(sanitized.indexOf('<img') === 0, 'Vue escapes stored text at render time; backend should preserve text.');
    }));
    tests.push(runTest_('Spreadsheet formula injection', function () {
      var sanitized = EntityService.sanitizeValue('+SUM(1,1)');
      assert_(sanitized.charAt(0) === "'", 'Dangerous spreadsheet prefix was not escaped.');
    }));
    return tests;
  }

  function flatten_(groups) {
    return groups.reduce(function (all, group) {
      return all.concat(group);
    }, []);
  }

  function runAllTests(user) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var startedAt = Date.now();
    var groups = [
      runUnitTests(user),
      runIntegrationTests(user),
      runPermissionTests(user),
      runExportTests(user),
      runSecurityTests(user)
    ];
    var tests = flatten_(groups);
    var passed = tests.filter(function (test) { return test.status === 'PASS'; }).length;
    var failed = tests.filter(function (test) { return test.status === 'FAIL'; }).length;
    var report = {
      totalTests: tests.length,
      passed: passed,
      failed: failed,
      skipped: 0,
      criticalIssues: failed,
      remainingIssues: failed,
      durationMs: Date.now() - startedAt,
      tests: tests,
      generatedAt: UtilService.nowIso()
    };
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.TEST_RUN, 'Test', 'runAllTests', {}, report, user, 'runAllTests', failed ? 'FAIL' : 'SUCCESS', failed ? 'One or more tests failed.' : '');
    return report;
  }

  return {
    runUnitTests: runUnitTests,
    runIntegrationTests: runIntegrationTests,
    runPermissionTests: runPermissionTests,
    runExportTests: runExportTests,
    runSecurityTests: runSecurityTests,
    runAllTests: runAllTests
  };
})();
