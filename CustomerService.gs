var CustomerService = (function () {
  function getAccessibleCustomerIdsForSales_(user) {
    var ids = {};
    DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS).forEach(function (project) {
      if (!UtilService.asBoolean(project.IsDeleted) && UtilService.coerceEmail(project.AssignedSalesEmail) === user.email) {
        ids[project.CustomerID] = true;
      }
    });
    return ids;
  }

  function filterCustomersForUser_(user, customers) {
    if (AuthService.isElevated(user)) return customers;
    var linkedCustomerIds = getAccessibleCustomerIdsForSales_(user);
    return customers.filter(function (customer) {
      return UtilService.coerceEmail(customer.OwnerEmail) === user.email || linkedCustomerIds[customer.CustomerID];
    });
  }

  function normalizeCustomer_(user, customerData, existing) {
    var ownerEmail = existing ? existing.OwnerEmail : customerData.OwnerEmail;
    if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES])) {
      ownerEmail = existing ? existing.OwnerEmail : user.email;
    }
    if (UtilService.isBlank(ownerEmail)) ownerEmail = user.email;

    return {
      CustomerID: existing ? existing.CustomerID : customerData.CustomerID,
      CompanyName: String(customerData.CompanyName || '').trim(),
      ContactPerson: String(customerData.ContactPerson || '').trim(),
      Phone: String(customerData.Phone || '').trim(),
      Email: String(customerData.Email || '').trim(),
      Address: String(customerData.Address || '').trim(),
      TaxID: String(customerData.TaxID || '').trim(),
      CustomerType: String(customerData.CustomerType || '').trim(),
      Industry: String(customerData.Industry || '').trim(),
      OwnerEmail: UtilService.coerceEmail(ownerEmail),
      Notes: String(customerData.Notes || '').trim()
    };
  }

  function validateCustomer(customerData) {
    var errors = [];
    if (UtilService.isBlank(customerData.CompanyName)) {
      errors.push({ field: 'CompanyName', message: 'Company name is required.' });
    }
    if (UtilService.isBlank(customerData.OwnerEmail)) {
      errors.push({ field: 'OwnerEmail', message: 'Owner email is required.' });
    } else if (!AuthService.getUserByEmail(customerData.OwnerEmail)) {
      errors.push({ field: 'OwnerEmail', message: 'Owner email must exist in Users.' });
    }
    if (!UtilService.isBlank(customerData.CustomerType) && CRM_CONFIG.CUSTOMER_TYPES.indexOf(customerData.CustomerType) === -1) {
      errors.push({ field: 'CustomerType', message: 'Invalid customer type.' });
    }
    if (!UtilService.isBlank(customerData.Email) && String(customerData.Email).indexOf('@') === -1) {
      errors.push({ field: 'Email', message: 'Valid email is required.' });
    }
    if (errors.length) throw UtilService.validationError(errors);
    return true;
  }

  function searchCustomers(user, query, options) {
    options = options || {};
    var customers = DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).filter(function (customer) {
      return !UtilService.asBoolean(customer.IsDeleted);
    });
    customers = filterCustomersForUser_(user, customers);
    customers = customers.filter(function (customer) {
      if (options.customerType && customer.CustomerType !== options.customerType) return false;
      if (options.industry && UtilService.normalize(customer.Industry) !== UtilService.normalize(options.industry)) return false;
      if (options.ownerEmail && AuthService.isElevated(user) && UtilService.coerceEmail(customer.OwnerEmail) !== UtilService.coerceEmail(options.ownerEmail)) return false;
      return UtilService.containsText(customer, ['CustomerID', 'CompanyName', 'ContactPerson', 'Email', 'Phone', 'TaxID', 'Industry'], query);
    });
    customers.sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'UpdatedAt');
    });
    return UtilService.paginate(customers, options);
  }

  function getCustomer(user, customerId) {
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', customerId);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound('Customer');
    if (!AuthService.canAccessCustomer(user, found.record)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'You do not have permission to access this customer.');
    }
    return found.record;
  }

  function saveCustomer(user, customerData) {
    customerData = customerData || {};
    var isUpdate = !UtilService.isBlank(customerData.CustomerID);
    var before = null;
    var after = null;

    if (isUpdate) {
      if (UtilService.isBlank(customerData.RowVersion)) {
        throw UtilService.validationError([{ field: 'RowVersion', message: 'RowVersion is required before updating.' }]);
      }
      var existing = getCustomer(user, customerData.CustomerID);
      before = existing;
      if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES]) && UtilService.coerceEmail(existing.OwnerEmail) !== user.email) {
        throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'Sales users can only edit customers they own.');
      }
      validateCustomer(normalizeCustomer_(user, customerData, existing));
    } else {
      validateCustomer(normalizeCustomer_(user, customerData, null));
    }

    DbService.withScriptLock(function () {
      var now = UtilService.nowIso();
      if (isUpdate) {
        var current = DbService.findRowById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', customerData.CustomerID);
        if (!current || UtilService.asBoolean(current.record.IsDeleted)) throw UtilService.notFound('Customer');
        var patch = normalizeCustomer_(user, customerData, current.record);
        patch.UpdatedAt = now;
        patch.UpdatedBy = user.email;
        after = DbService.updateRecordById(
          CRM_CONFIG.SHEETS.CUSTOMERS,
          'CustomerID',
          customerData.CustomerID,
          patch,
          customerData.RowVersion
        );
      } else {
        var newCustomer = normalizeCustomer_(user, customerData, null);
        newCustomer.CustomerID = DbService.generateId('CUST', CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID');
        newCustomer.IsDeleted = false;
        newCustomer.CreatedAt = now;
        newCustomer.UpdatedAt = now;
        newCustomer.CreatedBy = user.email;
        newCustomer.UpdatedBy = user.email;
        newCustomer.RowVersion = 1;
        after = DbService.appendRecord(CRM_CONFIG.SHEETS.CUSTOMERS, newCustomer);
      }
      UtilService.bumpCacheVersion();
    });

    AuditService.logAction(
      isUpdate ? CRM_CONFIG.AUDIT_ACTIONS.UPDATE_CUSTOMER : CRM_CONFIG.AUDIT_ACTIONS.CREATE_CUSTOMER,
      'Customer',
      after.CustomerID,
      before || {},
      after,
      user.email
    );
    return after;
  }

  function deleteCustomer(user, customerId) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', customerId);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound('Customer');
    var before = found.record;
    var after = null;
    DbService.withScriptLock(function () {
      after = DbService.softDeleteRecordById(CRM_CONFIG.SHEETS.CUSTOMERS, 'CustomerID', customerId, {
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      });
      UtilService.bumpCacheVersion();
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.DELETE_CUSTOMER, 'Customer', customerId, before, after, user.email);
    return after;
  }

  return {
    searchCustomers: searchCustomers,
    getCustomer: getCustomer,
    saveCustomer: saveCustomer,
    deleteCustomer: deleteCustomer,
    validateCustomer: validateCustomer
  };
})();
