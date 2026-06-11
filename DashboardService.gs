var DashboardService = (function () {
  function buildCustomerMap_(customers) {
    var map = {};
    customers.forEach(function (customer) {
      map[customer.CustomerID] = customer;
    });
    return map;
  }

  function getAccessibleCustomers_(user, projects, customers) {
    if (AuthService.isElevated(user)) return customers;
    var linkedIds = {};
    projects.forEach(function (project) {
      if (!UtilService.asBoolean(project.IsDeleted) && UtilService.coerceEmail(project.AssignedSalesEmail) === user.email) {
        linkedIds[project.CustomerID] = true;
      }
    });
    return customers.filter(function (customer) {
      return UtilService.coerceEmail(customer.OwnerEmail) === user.email || linkedIds[customer.CustomerID];
    });
  }

  function applyProjectFilters_(projects, customersById, user, filters) {
    filters = filters || {};
    return projects.filter(function (project) {
      if (UtilService.asBoolean(project.IsDeleted)) return false;
      if (!AuthService.canAccessProject(user, project)) return false;
      var customer = customersById[project.CustomerID] || {};
      if (filters.status && project.Status !== filters.status) return false;
      if (filters.responsibleDept && UtilService.normalize(project.ResponsibleDept) !== UtilService.normalize(filters.responsibleDept)) return false;
      if (filters.salesOwner && AuthService.isElevated(user) && UtilService.coerceEmail(project.AssignedSalesEmail) !== UtilService.coerceEmail(filters.salesOwner)) return false;
      if (filters.customerType && customer.CustomerType !== filters.customerType) return false;
      if (filters.industry && UtilService.normalize(customer.Industry) !== UtilService.normalize(filters.industry)) return false;
      var dateValue = Date.parse(project.ExpectedCloseDate || project.UpdatedAt || project.CreatedAt || '') || 0;
      if (filters.fromDate && dateValue < (Date.parse(filters.fromDate) || 0)) return false;
      if (filters.toDate && dateValue > (Date.parse(filters.toDate + ' 23:59:59') || Number.MAX_SAFE_INTEGER)) return false;
      return true;
    });
  }

  function incrementNumber_(target, key, value) {
    if (!target[key]) target[key] = 0;
    target[key] += value;
  }

  function getDashboard(user, filters) {
    filters = filters || {};
    var cachePayload = {
      v: UtilService.getCacheVersion(),
      role: user.role,
      email: AuthService.isElevated(user) ? 'all' : user.email,
      filters: filters
    };
    var cacheKey = UtilService.makeCacheKey('dashboard', cachePayload);
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      // Cache failures should never block dashboard access.
    }

    var rawCustomers = DbService.readTable(CRM_CONFIG.SHEETS.CUSTOMERS).filter(function (customer) {
      return !UtilService.asBoolean(customer.IsDeleted);
    });
    var rawProjects = DbService.readTable(CRM_CONFIG.SHEETS.PROJECTS);
    var accessibleCustomers = getAccessibleCustomers_(user, rawProjects, rawCustomers);
    var customerMap = buildCustomerMap_(rawCustomers);
    var filteredProjects = applyProjectFilters_(rawProjects, customerMap, user, filters);

    var customerCountByType = {};
    accessibleCustomers.filter(function (customer) {
      if (filters.customerType && customer.CustomerType !== filters.customerType) return false;
      if (filters.industry && UtilService.normalize(customer.Industry) !== UtilService.normalize(filters.industry)) return false;
      return true;
    }).forEach(function (customer) {
      incrementNumber_(customerCountByType, customer.CustomerType || 'Unknown', 1);
    });

    var projectCountByStatus = {};
    var projectValueByStatus = {};
    var totalProjectValue = 0;
    var totalExpectedValue = 0;
    var openPipelineValue = 0;
    var wonCount = 0;
    var lostCount = 0;

    var decoratedProjects = filteredProjects.map(function (project) {
      var customer = customerMap[project.CustomerID] || {};
      var value = UtilService.toNumber(project.ProjectValue, 0);
      var probability = UtilService.toNumber(project.Probability, 0);
      totalProjectValue += value;
      totalExpectedValue += value * probability / 100;
      incrementNumber_(projectCountByStatus, project.Status || 'Unknown', 1);
      incrementNumber_(projectValueByStatus, project.Status || 'Unknown', value);
      if (project.Status === 'COMPLETED') wonCount += 1;
      if (project.Status === 'CANCELLED') lostCount += 1;
      if (project.Status !== 'COMPLETED' && project.Status !== 'CANCELLED') openPipelineValue += value;
      return {
        ProjectID: project.ProjectID,
        ProjectName: project.ProjectName,
        CustomerID: project.CustomerID,
        CustomerName: customer.CompanyName || '',
        CustomerType: customer.CustomerType || '',
        Industry: customer.Industry || '',
        ResponsibleDept: project.ResponsibleDept || '',
        AssignedSalesEmail: project.AssignedSalesEmail || '',
        ProjectValue: value,
        Status: project.Status || '',
        Probability: probability,
        ExpectedCloseDate: project.ExpectedCloseDate || '',
        UpdatedAt: project.UpdatedAt || ''
      };
    });

    var recentProjects = decoratedProjects.slice().sort(function (a, b) {
      return UtilService.compareDescByDate(a, b, 'UpdatedAt');
    }).slice(0, 10);
    var topProjectsByValue = decoratedProjects.slice().sort(function (a, b) {
      return b.ProjectValue - a.ProjectValue;
    }).slice(0, 10);

    var data = {
      kpis: {
        totalProjects: filteredProjects.length,
        totalProjectValue: totalProjectValue,
        openPipelineValue: openPipelineValue,
        totalExpectedValue: totalExpectedValue,
        wonProjects: wonCount,
        lostProjects: lostCount,
        totalCustomers: accessibleCustomers.length
      },
      projectCountByStatus: projectCountByStatus,
      projectValueByStatus: projectValueByStatus,
      customerCountByType: customerCountByType,
      recentProjects: recentProjects,
      topProjectsByValue: topProjectsByValue,
      generatedAt: UtilService.nowIso()
    };

    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(data), CRM_CONFIG.CACHE.DASHBOARD_TTL_SECONDS);
    } catch (err) {
      // Cache write failures are non-fatal.
    }
    return data;
  }

  return {
    getDashboard: getDashboard
  };
})();
