var EntityService = (function () {
  var DANGEROUS_EXPORT_PREFIX = /^[=+\-@]/;

  function getConfig(entityName) {
    var config = CRM_CONFIG.ENTITY_CONFIG[entityName];
    if (!config) throw UtilService.notFound('Entity ' + entityName);
    return config;
  }

  function getEntityNames() {
    return Object.keys(CRM_CONFIG.ENTITY_CONFIG);
  }

  function getEntitySchemas(user) {
    var schemas = {};
    getEntityNames().forEach(function (entityName) {
      var config = getConfig(entityName);
      schemas[entityName] = {
        name: entityName,
        label: config.label,
        key: config.key,
        sheet: config.sheet,
        fields: CRM_CONFIG.HEADERS[config.sheet] || [],
        required: config.required || [],
        numeric: config.numeric || [],
        booleans: config.booleans || [],
        enums: config.enums || {},
        canCreate: canCreate(user, entityName),
        canUpdate: canCreate(user, entityName),
        canDelete: AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN])
      };
      if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES]) && config.costSensitiveFields) {
        schemas[entityName].fields = schemas[entityName].fields.filter(function (field) {
          return config.costSensitiveFields.indexOf(field) === -1;
        });
      }
    });
    return schemas;
  }

  function getUserId(user) {
    return user && (user.userId || (user.raw && user.raw.UserID)) ? (user.userId || user.raw.UserID) : '';
  }

  function userById_(userId) {
    if (!userId) return null;
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].UserID || '') === String(userId) && !UtilService.asBoolean(users[i].IsDeleted)) return users[i];
    }
    return null;
  }

  function canCreate(user, entityName) {
    if (!user) return false;
    if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN, CRM_CONFIG.ROLES.MANAGER])) return true;
    return ['customers', 'contacts', 'opportunities', 'activities'].indexOf(entityName) !== -1;
  }

  function canAccessCustomerId_(user, customerId) {
    if (AuthService.isElevated(user)) return true;
    var userId = getUserId(user);
    var customer = DbService.findRowById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', customerId);
    if (customer && String(customer.record.OwnerUserID || '') === String(userId)) return true;
    var opportunities = DbService.readTable(CRM_CONFIG.SHEETS.OPPORTUNITIES);
    return opportunities.some(function (opportunity) {
      return !UtilService.asBoolean(opportunity.IsDeleted)
        && opportunity.CustomerID === customerId
        && String(opportunity.OwnerUserID || '') === String(userId);
    });
  }

  function canAccessRecord(user, entityName, record) {
    if (!user || !record || UtilService.asBoolean(record.IsDeleted)) return false;
    if (AuthService.isElevated(user)) return true;
    if (entityName === 'products') return true;
    var config = getConfig(entityName);
    var userId = getUserId(user);
    if (config.ownerField && String(record[config.ownerField] || '') === String(userId)) return true;
    if (config.parentField && record[config.parentField]) {
      if (config.parentField === 'CustomerID') return canAccessCustomerId_(user, record.CustomerID);
      if (config.parentField === 'OpportunityID') {
        var opportunity = DbService.findRowById(CRM_CONFIG.SHEETS.OPPORTUNITIES, 'OpportunityID', record.OpportunityID);
        return opportunity ? canAccessRecord(user, 'opportunities', opportunity.record) : false;
      }
      if (config.parentField === 'QuotationID') return canAccessParentByLookup_(user, CRM_CONFIG.SHEETS.QUOTATIONS, 'QuotationID', record.QuotationID, 'quotations');
      if (config.parentField === 'SalesOrderID') return canAccessParentByLookup_(user, CRM_CONFIG.SHEETS.SALES_ORDERS, 'SalesOrderID', record.SalesOrderID, 'salesOrders');
      if (config.parentField === 'InvoiceID') return canAccessParentByLookup_(user, CRM_CONFIG.SHEETS.INVOICES, 'InvoiceID', record.InvoiceID, 'invoices');
      if (config.parentField === 'PaymentID') return canAccessParentByLookup_(user, CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentID', record.PaymentID, 'payments');
    }
    return false;
  }

  function canAccessParentByLookup_(user, sheetName, key, value, entityName) {
    var found = DbService.findRowById(sheetName, key, value);
    return found ? canAccessRecord(user, entityName, found.record) : false;
  }

  function sanitizeValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return DANGEROUS_EXPORT_PREFIX.test(trimmed) ? "'" + trimmed : trimmed;
    }
    return value;
  }

  function normalizeRecord(user, entityName, input, existing) {
    var config = getConfig(entityName);
    var headers = CRM_CONFIG.HEADERS[config.sheet] || [];
    var output = {};
    headers.forEach(function (field) {
      if (existing && Object.prototype.hasOwnProperty.call(existing, field)) output[field] = existing[field];
      else output[field] = '';
    });
    Object.keys(input || {}).forEach(function (field) {
      if (headers.indexOf(field) === -1) return;
      if (field === config.key || field === 'CreatedAt' || field === 'CreatedBy' || field === 'UpdatedAt' || field === 'UpdatedBy') return;
      output[field] = sanitizeValue(input[field]);
    });
    (config.numeric || []).forEach(function (field) {
      output[field] = UtilService.toNumber(output[field], 0);
    });
    if (entityName === 'products' && UtilService.isBlank(output.IsActive)) output.IsActive = true;
    (config.booleans || []).forEach(function (field) {
      output[field] = UtilService.asBoolean(output[field]);
    });
    if (config.ownerField && UtilService.isBlank(output[config.ownerField])) output[config.ownerField] = getUserId(user);
    if (entityName === 'opportunities') normalizeOpportunity_(output);
    if (entityName === 'quotations' || entityName === 'salesOrders' || entityName === 'invoices') normalizeDocumentTotals_(output);
    if (entityName === 'payments') normalizePaymentTotals_(output);
    return output;
  }

  function normalizeOpportunity_(record) {
    if (UtilService.isBlank(record.Stage)) record.Stage = 'NEW_INQUIRY';
    var stage = getPipelineStage(record.Stage);
    if (stage && UtilService.isBlank(record.Probability)) record.Probability = Number(stage.Probability || 0);
    record.Probability = Math.max(0, Math.min(100, UtilService.toNumber(record.Probability, 0)));
    record.EstimatedValue = UtilService.toNumber(record.EstimatedValue, 0);
    if (record.Stage === 'LOST' && UtilService.isBlank(record.LostReason)) {
      throw UtilService.validationError([{ field: 'LostReason', message: 'Lost reason is required when an opportunity is lost.' }]);
    }
  }

  function normalizeDocumentTotals_(record) {
    var subtotal = UtilService.toNumber(record.Subtotal, 0);
    var discount = UtilService.toNumber(record.Discount, 0);
    var vat = UtilService.toNumber(record.VAT, 0);
    var withholding = UtilService.toNumber(record.WithholdingTax, 0);
    record.GrandTotal = Math.max(0, subtotal - discount + vat - withholding);
    if (Object.prototype.hasOwnProperty.call(record, 'OutstandingAmount')) {
      var paid = UtilService.toNumber(record.PaidAmount, 0);
      record.OutstandingAmount = Math.max(0, record.GrandTotal - paid);
      if (record.OutstandingAmount === 0 && record.GrandTotal > 0) record.PaymentStatus = 'Paid';
      else if (paid > 0) record.PaymentStatus = 'Partially Paid';
      else if (!record.PaymentStatus) record.PaymentStatus = record.InvoiceStatus || 'Issued';
    }
  }

  function normalizePaymentTotals_(record) {
    var received = UtilService.toNumber(record.ReceivedAmount, 0);
    var fee = UtilService.toNumber(record.BankFee, 0);
    var withholding = UtilService.toNumber(record.WithholdingTaxAmount, 0);
    record.NetReceivedAmount = Math.max(0, received - fee - withholding);
    if (UtilService.isBlank(record.UnallocatedAmount)) record.UnallocatedAmount = record.NetReceivedAmount;
    record.UnallocatedAmount = Math.max(0, UtilService.toNumber(record.UnallocatedAmount, 0));
    if (!record.PaymentStatus) record.PaymentStatus = record.UnallocatedAmount > 0 ? 'Partially Allocated' : 'Allocated';
  }

  function getPipelineStage(stageCode) {
    var stages = getPipelineStages();
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].StageCode === stageCode) return stages[i];
    }
    return null;
  }

  function getPipelineStages() {
    try {
      var stages = DbService.readTable(CRM_CONFIG.SHEETS.PIPELINE_STAGES);
      if (stages.length) {
        return stages
          .filter(function (stage) { return UtilService.asBoolean(stage.IsActive); })
          .sort(function (a, b) { return Number(a.SortOrder || 0) - Number(b.SortOrder || 0); });
      }
    } catch (err) {
      // Setup may not have run yet.
    }
    return CRM_CONFIG.PIPELINE_STAGES.slice();
  }

  function validateRequired_(config, record) {
    var errors = [];
    (config.required || []).forEach(function (field) {
      if (UtilService.isBlank(record[field])) errors.push({ field: field, message: field + ' is required.' });
    });
    Object.keys(config.enums || {}).forEach(function (field) {
      if (!UtilService.isBlank(record[field]) && config.enums[field].indexOf(record[field]) === -1) {
        errors.push({ field: field, message: 'Invalid value for ' + field + '.' });
      }
    });
    if (errors.length) throw UtilService.validationError(errors);
  }

  function validateReferences_(entityName, record) {
    var errors = [];
    function requireRecord(sheetName, key, value, field) {
      if (UtilService.isBlank(value)) return;
      var found = DbService.findRowById(sheetName, key, value);
      if (!found || UtilService.asBoolean(found.record.IsDeleted)) {
        errors.push({ field: field, message: field + ' does not reference an active record.' });
      }
    }
    if (record.CustomerID) requireRecord(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', record.CustomerID, 'CustomerID');
    if (record.ContactID) requireRecord(CRM_CONFIG.SHEETS.CONTACTS, 'ContactID', record.ContactID, 'ContactID');
    if (record.OpportunityID) requireRecord(CRM_CONFIG.SHEETS.OPPORTUNITIES, 'OpportunityID', record.OpportunityID, 'OpportunityID');
    if (record.ProductID) requireRecord(CRM_CONFIG.SHEETS.PRODUCTS, 'ProductID', record.ProductID, 'ProductID');
    if (record.QuotationID) requireRecord(CRM_CONFIG.SHEETS.QUOTATIONS, 'QuotationID', record.QuotationID, 'QuotationID');
    if (record.SalesOrderID) requireRecord(CRM_CONFIG.SHEETS.SALES_ORDERS, 'SalesOrderID', record.SalesOrderID, 'SalesOrderID');
    if (record.InvoiceID) requireRecord(CRM_CONFIG.SHEETS.INVOICES, 'InvoiceID', record.InvoiceID, 'InvoiceID');
    if (record.PaymentID) requireRecord(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentID', record.PaymentID, 'PaymentID');
    if (record.OwnerUserID) requireRecord(CRM_CONFIG.SHEETS.USERS, 'UserID', record.OwnerUserID, 'OwnerUserID');
    if (record.AssignedToUserID) requireRecord(CRM_CONFIG.SHEETS.USERS, 'UserID', record.AssignedToUserID, 'AssignedToUserID');
    if (errors.length) throw UtilService.validationError(errors);
  }

  function validateUnique_(entityName, record, existingId) {
    var config = getConfig(entityName);
    var uniqueFields = config.unique || [];
    if (!uniqueFields.length) return;
    var rows = DbService.readTable(config.sheet);
    var errors = [];
    uniqueFields.forEach(function (field) {
      if (UtilService.isBlank(record[field])) return;
      var normalized = UtilService.normalize(record[field]);
      var duplicate = rows.some(function (row) {
        return !UtilService.asBoolean(row.IsDeleted)
          && String(row[config.key] || '') !== String(existingId || '')
          && UtilService.normalize(row[field]) === normalized;
      });
      if (duplicate) errors.push({ field: field, message: field + ' must be unique.' });
    });
    if (errors.length) throw UtilService.validationError(errors);
  }

  function validateStageTransition_(user, record, existing) {
    if (!existing || !record.Stage || !existing.Stage || record.Stage === existing.Stage) return;
    if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.ADMIN])) return;
    var oldStage = getPipelineStage(existing.Stage);
    if (!oldStage) return;
    var allowed = UtilService.safeJsonParse(oldStage.AllowedNextStagesJson, []);
    if (allowed.indexOf(record.Stage) === -1) {
      throw UtilService.validationError([{ field: 'Stage', message: 'Invalid stage transition from ' + existing.Stage + ' to ' + record.Stage + '.' }]);
    }
  }

  function validatePaymentAllocation_(record, existingId) {
    if (!record.PaymentID || UtilService.isBlank(record.AllocatedAmount)) return;
    var payment = DbService.findRowById(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentID', record.PaymentID);
    if (!payment) throw UtilService.validationError([{ field: 'PaymentID', message: 'Payment not found.' }]);
    var net = UtilService.toNumber(payment.record.NetReceivedAmount, 0);
    var allocated = DbService.readTable(CRM_CONFIG.SHEETS.PAYMENT_ALLOCATIONS).reduce(function (sum, allocation) {
      if (UtilService.asBoolean(allocation.IsDeleted)) return sum;
      if (String(allocation.PaymentID || '') !== String(record.PaymentID)) return sum;
      if (existingId && String(allocation.AllocationID || '') === String(existingId)) return sum;
      return sum + UtilService.toNumber(allocation.AllocatedAmount, 0);
    }, 0);
    if (allocated + UtilService.toNumber(record.AllocatedAmount, 0) > net) {
      throw UtilService.validationError([{ field: 'AllocatedAmount', message: 'Payment allocation cannot exceed net received amount.' }]);
    }
  }

  function decorateRecord_(user, entityName, record) {
    var config = getConfig(entityName);
    var output = {};
    Object.keys(record || {}).forEach(function (key) { output[key] = record[key]; });
    if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES]) && config.costSensitiveFields) {
      config.costSensitiveFields.forEach(function (field) { delete output[field]; });
    }
    if (output.OwnerUserID) {
      var owner = userById_(output.OwnerUserID);
      output.OwnerName = owner ? owner.FullName || owner.Email : '';
    }
    if (output.AssignedToUserID) {
      var assigned = userById_(output.AssignedToUserID);
      output.AssignedToName = assigned ? assigned.FullName || assigned.Email : '';
    }
    return output;
  }

  function listRecords(user, entityName, filters) {
    filters = filters || {};
    var config = getConfig(entityName);
    var rows = DbService.readTable(config.sheet)
      .filter(function (record) { return !UtilService.asBoolean(record.IsDeleted); })
      .filter(function (record) { return canAccessRecord(user, entityName, record); });
    var query = filters.query || '';
    rows = rows.filter(function (record) {
      if (query && !UtilService.containsText(record, config.searchable || CRM_CONFIG.HEADERS[config.sheet], query)) return false;
      if (filters.customerId && String(record.CustomerID || '') !== String(filters.customerId)) return false;
      if (filters.status && String(record.Status || record.Stage || record.InvoiceStatus || record.PaymentStatus || '') !== String(filters.status)) return false;
      if (filters.ownerUserId && String(record.OwnerUserID || record.AssignedToUserID || '') !== String(filters.ownerUserId)) return false;
      if (filters.fromDate || filters.toDate) {
        var dateValue = Date.parse(record.UpdatedAt || record.CreatedAt || record.ActivityDate || record.InvoiceDate || record.PaymentDate || '') || 0;
        if (filters.fromDate && dateValue < (Date.parse(filters.fromDate) || 0)) return false;
        if (filters.toDate && dateValue > (Date.parse(filters.toDate + ' 23:59:59') || Number.MAX_SAFE_INTEGER)) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'UpdatedAt');
    });
    return UtilService.paginate(rows.map(function (record) { return decorateRecord_(user, entityName, record); }), filters);
  }

  function getRecord(user, entityName, id) {
    var config = getConfig(entityName);
    var found = DbService.findRowById(config.sheet, config.key, id);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound(config.label);
    if (!canAccessRecord(user, entityName, found.record)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'You do not have permission to access this record.');
    }
    return decorateRecord_(user, entityName, found.record);
  }

  function saveRecord(user, entityName, input) {
    if (!canCreate(user, entityName)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'You do not have permission to save this record.');
    }
    input = input || {};
    var config = getConfig(entityName);
    var id = input[config.key];
    var isUpdate = !UtilService.isBlank(id);
    var before = null;
    var after = null;
    var normalized = null;

    if (isUpdate) {
      before = getRecord(user, entityName, id);
      if (UtilService.isBlank(input.RecordVersion)) {
        throw UtilService.validationError([{ field: 'RecordVersion', message: 'RecordVersion is required for updates.' }]);
      }
      normalized = normalizeRecord(user, entityName, input, before);
      validateStageTransition_(user, normalized, before);
    } else {
      normalized = normalizeRecord(user, entityName, input, null);
    }
    validateRequired_(config, normalized);
    validateReferences_(entityName, normalized);
    validateUnique_(entityName, normalized, isUpdate ? id : '');
    if (entityName === 'paymentAllocations') validatePaymentAllocation_(normalized, isUpdate ? id : '');

    DbService.withScriptLock(function () {
      var now = UtilService.nowIso();
      if (isUpdate) {
        var current = DbService.findRowById(config.sheet, config.key, id);
        if (!current || UtilService.asBoolean(current.record.IsDeleted)) throw UtilService.notFound(config.label);
        var patch = normalizeRecord(user, entityName, input, current.record);
        patch.UpdatedAt = now;
        patch.UpdatedBy = user.email;
        after = DbService.updateRecordById(config.sheet, config.key, id, patch, input.RecordVersion);
      } else {
        normalized[config.key] = DbService.generateUuid(config.prefix);
        if (config.numberField && UtilService.isBlank(normalized[config.numberField])) {
          normalized[config.numberField] = DbService.generateDocumentNumber(config.numberPrefix || config.prefix);
        }
        normalized.CreatedAt = now;
        normalized.CreatedBy = user.email;
        normalized.UpdatedAt = now;
        normalized.UpdatedBy = user.email;
        normalized.RecordVersion = 1;
        if ((CRM_CONFIG.HEADERS[config.sheet] || []).indexOf('IsDeleted') !== -1) normalized.IsDeleted = false;
        after = DbService.appendRecord(config.sheet, normalized);
      }
      if (entityName === 'paymentAllocations' || entityName === 'payments') reconcilePayments_();
      UtilService.bumpCacheVersion();
    });

    AuditService.logAction(
      isUpdate ? CRM_CONFIG.AUDIT_ACTIONS.UPDATE : CRM_CONFIG.AUDIT_ACTIONS.CREATE,
      entityName,
      after[config.key],
      before || {},
      after,
      user,
      entityName + '.save'
    );
    return decorateRecord_(user, entityName, after);
  }

  function deleteRecord(user, entityName, id) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var config = getConfig(entityName);
    var found = DbService.findRowById(config.sheet, config.key, id);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound(config.label);
    var before = found.record;
    var after = null;
    DbService.withScriptLock(function () {
      after = DbService.softDeleteRecordById(config.sheet, config.key, id, {
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      });
      UtilService.bumpCacheVersion();
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.DELETE, entityName, id, before, after, user, entityName + '.delete');
    return decorateRecord_(user, entityName, after);
  }

  function restoreRecord(user, entityName, id) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var config = getConfig(entityName);
    var found = DbService.findRowById(config.sheet, config.key, id);
    if (!found) throw UtilService.notFound(config.label);
    var before = found.record;
    var after = null;
    DbService.withScriptLock(function () {
      after = DbService.updateRecordById(config.sheet, config.key, id, {
        IsDeleted: false,
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      }, null);
      UtilService.bumpCacheVersion();
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.RESTORE, entityName, id, before, after, user, entityName + '.restore');
    return decorateRecord_(user, entityName, after);
  }

  function listUsersForLookup(user) {
    var users = DbService.readTable(CRM_CONFIG.SHEETS.USERS)
      .filter(function (item) {
        return UtilService.asBoolean(item.IsActive) && !UtilService.asBoolean(item.IsDeleted);
      })
      .filter(function (item) {
        return AuthService.isElevated(user) || UtilService.coerceEmail(item.Email) === user.email;
      })
      .map(function (item) {
        return {
          UserID: item.UserID,
          Email: UtilService.coerceEmail(item.Email),
          FullName: item.FullName || item.Email,
          Role: item.Role
        };
      });
    users.sort(function (a, b) {
      return String(a.FullName).localeCompare(String(b.FullName));
    });
    return users;
  }

  function getLookups(user) {
    return {
      users: listUsersForLookup(user),
      pipelineStages: getPipelineStages(),
      customerTypes: CRM_CONFIG.CUSTOMER_TYPES,
      customerStatuses: CRM_CONFIG.CUSTOMER_STATUSES,
      priorities: CRM_CONFIG.PRIORITIES,
      activityTypes: CRM_CONFIG.ACTIVITY_TYPES,
      activityStatuses: CRM_CONFIG.ACTIVITY_STATUSES,
      documentStatuses: CRM_CONFIG.DOCUMENT_STATUSES,
      orderStatuses: CRM_CONFIG.ORDER_STATUSES,
      invoiceStatuses: CRM_CONFIG.INVOICE_STATUSES,
      paymentStatuses: CRM_CONFIG.PAYMENT_STATUSES,
      paymentMethods: CRM_CONFIG.PAYMENT_METHODS
    };
  }

  function reconcilePayments_() {
    var payments = DbService.readTable(CRM_CONFIG.SHEETS.PAYMENTS).filter(function (payment) {
      return !UtilService.asBoolean(payment.IsDeleted);
    });
    var allocations = DbService.readTable(CRM_CONFIG.SHEETS.PAYMENT_ALLOCATIONS).filter(function (allocation) {
      return !UtilService.asBoolean(allocation.IsDeleted);
    });
    var invoices = DbService.readTable(CRM_CONFIG.SHEETS.INVOICES).filter(function (invoice) {
      return !UtilService.asBoolean(invoice.IsDeleted);
    });
    var paymentAllocated = {};
    var invoicePaid = {};
    allocations.forEach(function (allocation) {
      var amount = UtilService.toNumber(allocation.AllocatedAmount, 0);
      paymentAllocated[allocation.PaymentID] = (paymentAllocated[allocation.PaymentID] || 0) + amount;
      invoicePaid[allocation.InvoiceID] = (invoicePaid[allocation.InvoiceID] || 0) + amount;
    });
    payments.forEach(function (payment) {
      var net = UtilService.toNumber(payment.NetReceivedAmount, 0);
      var allocated = paymentAllocated[payment.PaymentID] || 0;
      var unallocated = Math.max(0, net - allocated);
      var status = allocated === 0 ? 'Unallocated' : (unallocated > 0 ? 'Partially Allocated' : 'Allocated');
      // Skip untouched rows so reconciliation only writes what actually changed.
      if (UtilService.toNumber(payment.UnallocatedAmount, 0) === unallocated
        && String(payment.PaymentStatus || '') === status) return;
      DbService.updateRecordById(CRM_CONFIG.SHEETS.PAYMENTS, 'PaymentID', payment.PaymentID, {
        UnallocatedAmount: unallocated,
        PaymentStatus: status,
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: 'reconcile'
      }, null);
    });
    invoices.forEach(function (invoice) {
      var paid = invoicePaid[invoice.InvoiceID] || UtilService.toNumber(invoice.PaidAmount, 0);
      var total = UtilService.toNumber(invoice.GrandTotal, 0);
      var outstanding = Math.max(0, total - paid);
      var paymentStatus = outstanding === 0 && total > 0 ? 'Paid' : (paid > 0 ? 'Partially Paid' : invoice.PaymentStatus || 'Issued');
      // Skip untouched rows so reconciliation only writes what actually changed.
      if (UtilService.toNumber(invoice.PaidAmount, 0) === paid
        && UtilService.toNumber(invoice.OutstandingAmount, 0) === outstanding
        && String(invoice.PaymentStatus || '') === paymentStatus) return;
      DbService.updateRecordById(CRM_CONFIG.SHEETS.INVOICES, 'InvoiceID', invoice.InvoiceID, {
        PaidAmount: paid,
        OutstandingAmount: outstanding,
        PaymentStatus: paymentStatus,
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: 'reconcile'
      }, null);
    });
  }

  return {
    getEntityNames: getEntityNames,
    getEntitySchemas: getEntitySchemas,
    getPipelineStages: getPipelineStages,
    getLookups: getLookups,
    listRecords: listRecords,
    getRecord: getRecord,
    saveRecord: saveRecord,
    deleteRecord: deleteRecord,
    restoreRecord: restoreRecord,
    sanitizeValue: sanitizeValue,
    canAccessRecord: canAccessRecord,
    canAccessCustomerId: canAccessCustomerId_
  };
})();
