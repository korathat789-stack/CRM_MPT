var ProjectService = (function () {
  function loadWorkflowStates_() {
    var states = [];
    try {
      states = DbService.readTable(CRM_CONFIG.SHEETS.WORKFLOW_STATES);
    } catch (err) {
      states = CRM_CONFIG.WORKFLOW_DEFAULTS.slice();
    }
    if (!states.length) states = CRM_CONFIG.WORKFLOW_DEFAULTS.slice();
    return states
      .map(function (state) {
        return {
          StateCode: state.StateCode,
          StateName: state.StateName,
          SortOrder: Number(state.SortOrder || 0),
          RequiredFieldsJson: state.RequiredFieldsJson || '[]',
          AllowedNextStatesJson: state.AllowedNextStatesJson || '[]',
          IsTerminal: UtilService.asBoolean(state.IsTerminal),
          IsActive: UtilService.asBoolean(state.IsActive),
          RequiredFields: UtilService.safeJsonParse(state.RequiredFieldsJson, []),
          AllowedNextStates: UtilService.safeJsonParse(state.AllowedNextStatesJson, []),
          FieldConfig: CRM_CONFIG.STATUS_FIELD_CONFIG[state.StateCode] || []
        };
      })
      .sort(function (a, b) {
        return a.SortOrder - b.SortOrder;
      });
  }

  function getWorkflowStateMap_() {
    var map = {};
    loadWorkflowStates_().forEach(function (state) {
      map[state.StateCode] = state;
    });
    return map;
  }

  function getWorkflowStates() {
    return loadWorkflowStates_();
  }

  function normalizeStatusDetails_(statusDetails) {
    return UtilService.parseJsonOrThrow(statusDetails || {}, 'StatusDetails');
  }

  function validateStateMachine(projectData, existingProject) {
    var errors = [];
    var stateMap = getWorkflowStateMap_();
    var newStatus = projectData.Status;
    var state = stateMap[newStatus];
    var details = normalizeStatusDetails_(projectData.StatusDetails);

    if (!state || !state.IsActive) {
      errors.push({ field: 'Status', message: 'Invalid or inactive project status.' });
    }

    if (state) {
      state.RequiredFields.forEach(function (field) {
        if (UtilService.isBlank(details[field])) {
          errors.push({
            field: 'StatusDetails.' + field,
            message: field + ' is required for status ' + state.StateName + '.'
          });
        }
      });
    }

    if (existingProject && existingProject.Status !== newStatus) {
      var oldState = stateMap[existingProject.Status];
      if (oldState && oldState.IsTerminal) {
        errors.push({ field: 'Status', message: 'Terminal states cannot transition to another state.' });
      } else if (oldState) {
        var allowed = oldState.AllowedNextStates || [];
        var canCancel = newStatus === 'CANCELLED' && !oldState.IsTerminal;
        if (!canCancel && allowed.indexOf(newStatus) === -1) {
          errors.push({
            field: 'Status',
            message: 'Invalid status transition from ' + existingProject.Status + ' to ' + newStatus + '.'
          });
        }
      }
    }

    if (newStatus === 'PROCUREMENT') {
      ['FinalPrice', 'PONumber', 'QuotationNumber', 'ContractStatus'].forEach(function (field) {
        if (UtilService.isBlank(details[field])) {
          errors.push({ field: 'StatusDetails.' + field, message: field + ' is required for procurement.' });
        }
      });
    }
    if (newStatus === 'CANCELLED' && UtilService.isBlank(details.CancelReason)) {
      errors.push({ field: 'StatusDetails.CancelReason', message: 'Cancel reason is required.' });
    }

    if (errors.length) throw UtilService.validationError(errors);
    return details;
  }

  function decorateProject_(project, customerMap) {
    var customer = customerMap && customerMap[project.CustomerID] ? customerMap[project.CustomerID] : {};
    var output = {};
    Object.keys(project).forEach(function (key) {
      output[key] = project[key];
    });
    output.ProjectValue = UtilService.toNumber(output.ProjectValue, 0);
    output.Probability = UtilService.toNumber(output.Probability, 0);
    output.RowVersion = UtilService.toNumber(output.RowVersion, 0);
    output.CustomerName = customer.CompanyName || '';
    output.CustomerType = customer.CustomerType || '';
    output.Industry = customer.Industry || '';
    output.StatusDetailsObject = UtilService.safeJsonParse(output.StatusDetails, {});
    return output;
  }

  function getCustomerMap_() {
    var map = {};
    DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).forEach(function (customer) {
      if (!UtilService.asBoolean(customer.IsDeleted)) map[customer.CustomerID] = customer;
    });
    return map;
  }

  function normalizeProject_(user, projectData, existingProject) {
    var assignedEmail = existingProject ? existingProject.AssignedSalesEmail : projectData.AssignedSalesEmail;
    if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES])) assignedEmail = user.email;
    if (UtilService.isBlank(assignedEmail)) assignedEmail = user.email;
    var details = normalizeStatusDetails_(projectData.StatusDetails);

    return {
      ProjectID: existingProject ? existingProject.ProjectID : projectData.ProjectID,
      CustomerID: String(projectData.CustomerID || '').trim(),
      ProjectName: String(projectData.ProjectName || '').trim(),
      ResponsibleDept: String(projectData.ResponsibleDept || '').trim(),
      AssignedSalesEmail: UtilService.coerceEmail(assignedEmail),
      ProjectValue: projectData.ProjectValue,
      Status: String(projectData.Status || '').trim(),
      StatusDetails: details,
      ExpectedCloseDate: String(projectData.ExpectedCloseDate || '').trim(),
      Priority: String(projectData.Priority || 'Medium').trim(),
      Probability: projectData.Probability,
      Notes: String(projectData.Notes || '').trim()
    };
  }

  function validateProject(user, projectData, existingProject) {
    var errors = [];
    if (UtilService.isBlank(projectData.CustomerID)) {
      errors.push({ field: 'CustomerID', message: 'Customer is required.' });
    } else {
      try {
        CustomerService.getCustomer(user, projectData.CustomerID);
      } catch (err) {
        if (err && err.code === CRM_CONFIG.ERROR_CODES.ACCESS_DENIED) throw err;
        errors.push({ field: 'CustomerID', message: 'CustomerID does not exist or is deleted.' });
      }
    }

    if (UtilService.isBlank(projectData.ProjectName)) {
      errors.push({ field: 'ProjectName', message: 'Project name is required.' });
    }
    if (UtilService.isBlank(projectData.AssignedSalesEmail)) {
      errors.push({ field: 'AssignedSalesEmail', message: 'Assigned sales email is required.' });
    } else {
      var assignedUser = AuthService.getUserByEmail(projectData.AssignedSalesEmail);
      if (!assignedUser || !UtilService.asBoolean(assignedUser.IsActive)) {
        errors.push({ field: 'AssignedSalesEmail', message: 'Assigned sales email must exist and be active.' });
      }
    }
    if (UtilService.isBlank(projectData.ProjectValue) || isNaN(Number(projectData.ProjectValue))) {
      errors.push({ field: 'ProjectValue', message: 'Project value must be a number.' });
    }
    var probability = Number(projectData.Probability || 0);
    if (isNaN(probability) || probability < 0 || probability > 100) {
      errors.push({ field: 'Probability', message: 'Probability must be between 0 and 100.' });
    }
    if (CRM_CONFIG.PRIORITIES.indexOf(projectData.Priority || 'Medium') === -1) {
      errors.push({ field: 'Priority', message: 'Invalid priority.' });
    }

    if (errors.length) throw UtilService.validationError(errors);
    validateStateMachine(projectData, existingProject);
    return true;
  }

  function searchProjects(user, filters, pagination) {
    filters = filters || {};
    pagination = pagination || filters;
    var customerMap = getCustomerMap_();
    var projects = DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS).filter(function (project) {
      return !UtilService.asBoolean(project.IsDeleted) && AuthService.canAccessProject(user, project);
    });

    projects = projects.map(function (project) {
      return decorateProject_(project, customerMap);
    }).filter(function (project) {
      var customer = customerMap[project.CustomerID] || {};
      if (filters.status && project.Status !== filters.status) return false;
      if (filters.assignedSalesEmail && AuthService.isElevated(user) && UtilService.coerceEmail(project.AssignedSalesEmail) !== UtilService.coerceEmail(filters.assignedSalesEmail)) return false;
      if (filters.responsibleDept && UtilService.normalize(project.ResponsibleDept) !== UtilService.normalize(filters.responsibleDept)) return false;
      if (filters.customerType && customer.CustomerType !== filters.customerType) return false;
      if (filters.industry && UtilService.normalize(customer.Industry) !== UtilService.normalize(filters.industry)) return false;
      if (filters.priority && project.Priority !== filters.priority) return false;
      var closeDate = Date.parse(project.ExpectedCloseDate || project.UpdatedAt || project.CreatedAt || '') || 0;
      if (filters.fromDate && closeDate < (Date.parse(filters.fromDate) || 0)) return false;
      if (filters.toDate && closeDate > (Date.parse(filters.toDate + ' 23:59:59') || Number.MAX_SAFE_INTEGER)) return false;
      return UtilService.containsText(project, ['ProjectID', 'ProjectName', 'CustomerID', 'CustomerName', 'ResponsibleDept'], filters.query || '');
    });

    projects.sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'UpdatedAt');
    });
    return UtilService.paginate(projects, pagination);
  }

  function getProject(user, projectId) {
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID', projectId);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound('Project');
    if (!AuthService.canAccessProject(user, found.record)) {
      throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'You do not have permission to access this project.');
    }
    return decorateProject_(found.record, getCustomerMap_());
  }

  function saveProject(user, projectData) {
    projectData = projectData || {};
    var isUpdate = !UtilService.isBlank(projectData.ProjectID);
    var before = null;
    var after = null;
    var normalized = null;

    if (isUpdate) {
      if (UtilService.isBlank(projectData.RowVersion)) {
        throw UtilService.validationError([{ field: 'RowVersion', message: 'RowVersion is required before updating.' }]);
      }
      before = getProject(user, projectData.ProjectID);
      normalized = normalizeProject_(user, projectData, before);
      if (AuthService.hasRole(user, [CRM_CONFIG.ROLES.SALES]) && UtilService.coerceEmail(before.AssignedSalesEmail) !== user.email) {
        throw UtilService.createError(CRM_CONFIG.ERROR_CODES.ACCESS_DENIED, 'Sales users can only edit their own projects.');
      }
      validateProject(user, normalized, before);
    } else {
      normalized = normalizeProject_(user, projectData, null);
      validateProject(user, normalized, null);
    }

    DbService.withScriptLock(function () {
      var now = UtilService.nowIso();
      if (isUpdate) {
        var current = DbService.findRowById(CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID', projectData.ProjectID);
        if (!current || UtilService.asBoolean(current.record.IsDeleted)) throw UtilService.notFound('Project');
        var patch = normalizeProject_(user, projectData, current.record);
        patch.ProjectValue = Number(patch.ProjectValue);
        patch.Probability = Number(patch.Probability || 0);
        patch.StatusDetails = UtilService.stringifyJson(patch.StatusDetails);
        patch.UpdatedAt = now;
        patch.UpdatedBy = user.email;
        after = DbService.updateRecordById(
          CRM_CONFIG.SHEETS.PROJECTS,
          'ProjectID',
          projectData.ProjectID,
          patch,
          projectData.RowVersion
        );
      } else {
        var newProject = normalized;
        newProject.ProjectID = DbService.generateId('PRJ', CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID');
        newProject.ProjectValue = Number(newProject.ProjectValue);
        newProject.Probability = Number(newProject.Probability || 0);
        newProject.StatusDetails = UtilService.stringifyJson(newProject.StatusDetails);
        newProject.IsDeleted = false;
        newProject.CreatedAt = now;
        newProject.UpdatedAt = now;
        newProject.CreatedBy = user.email;
        newProject.UpdatedBy = user.email;
        newProject.RowVersion = 1;
        after = DbService.appendRecord(CRM_CONFIG.SHEETS.PROJECTS, newProject);
      }
      UtilService.bumpCacheVersion();
    });

    var action = isUpdate && before.Status !== after.Status
      ? CRM_CONFIG.AUDIT_ACTIONS.CHANGE_PROJECT_STATUS
      : (isUpdate ? CRM_CONFIG.AUDIT_ACTIONS.UPDATE_PROJECT : CRM_CONFIG.AUDIT_ACTIONS.CREATE_PROJECT);
    AuditService.logAction(action, 'Project', after.ProjectID, before || {}, after, user.email);
    return decorateProject_(after, getCustomerMap_());
  }

  function deleteProject(user, projectId) {
    AuthService.assertPermission(user, [CRM_CONFIG.ROLES.ADMIN]);
    var found = DbService.findRowById(CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID', projectId);
    if (!found || UtilService.asBoolean(found.record.IsDeleted)) throw UtilService.notFound('Project');
    var before = found.record;
    var after = null;
    DbService.withScriptLock(function () {
      after = DbService.softDeleteRecordById(CRM_CONFIG.SHEETS.PROJECTS, 'ProjectID', projectId, {
        UpdatedAt: UtilService.nowIso(),
        UpdatedBy: user.email
      });
      UtilService.bumpCacheVersion();
    });
    AuditService.logAction(CRM_CONFIG.AUDIT_ACTIONS.DELETE_PROJECT, 'Project', projectId, before, after, user.email);
    return decorateProject_(after, getCustomerMap_());
  }

  return {
    searchProjects: searchProjects,
    getProject: getProject,
    saveProject: saveProject,
    deleteProject: deleteProject,
    validateProject: validateProject,
    validateStateMachine: validateStateMachine,
    getWorkflowStates: getWorkflowStates
  };
})();
