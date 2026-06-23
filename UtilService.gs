var UtilService = (function () {
  function getTimezone() {
    try {
      var configured = SettingsService.getSettingValue('DEFAULT_TIMEZONE');
      return configured || Session.getScriptTimeZone() || CRM_CONFIG.APP.DEFAULT_TIMEZONE;
    } catch (err) {
      return CRM_CONFIG.APP.DEFAULT_TIMEZONE;
    }
  }

  function nowIso() {
    return Utilities.formatDate(new Date(), getTimezone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function formatDateTime(value) {
    if (!value) return '';
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, getTimezone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return String(value);
  }

  function normalize(value) {
    return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  }

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function asBoolean(value) {
    if (value === true) return true;
    if (value === false) return false;
    var normalized = normalize(value);
    return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'y';
  }

  function toNumber(value, fallback) {
    if (isBlank(value)) return fallback === undefined ? 0 : fallback;
    var parsed = Number(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  function safeJsonParse(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch (err) {
      return fallback;
    }
  }

  function parseJsonOrThrow(value, fieldName) {
    if (value === null || value === undefined || value === '') return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch (err) {
      throw validationError([
        { field: fieldName || 'json', message: 'Invalid JSON format.' }
      ]);
    }
  }

  function stringifyJson(value) {
    if (value === null || value === undefined || value === '') return '';
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '{}';
    }
  }

  function padNumber(value, width) {
    var output = String(value);
    while (output.length < width) output = '0' + output;
    return output;
  }

  function createError(code, message, errors, details) {
    var err = new Error(message || 'Unexpected error.');
    err.crm = true;
    err.code = code || CRM_CONFIG.ERROR_CODES.UNKNOWN_ERROR;
    err.errors = errors || [];
    err.details = details || {};
    return err;
  }

  function validationError(errors) {
    return createError(
      CRM_CONFIG.ERROR_CODES.VALIDATION_ERROR,
      'Validation failed.',
      errors || []
    );
  }

  function notFound(entityName) {
    return createError(
      CRM_CONFIG.ERROR_CODES.NOT_FOUND,
      (entityName || 'Record') + ' was not found.'
    );
  }

  function success(data, message) {
    return {
      success: true,
      data: data === undefined ? {} : data,
      message: message || 'OK'
    };
  }

  function errorResponse(code, message, errors) {
    return {
      success: false,
      code: code || CRM_CONFIG.ERROR_CODES.UNKNOWN_ERROR,
      message: message || 'Something went wrong. Please try again.',
      errors: errors || []
    };
  }

  function handleError(err) {
    if (err && err.crm) {
      return errorResponse(err.code, err.message, err.errors || []);
    }
    try {
      Logger.log(err && err.stack ? err.stack : err);
    } catch (logErr) {
      // Logger can fail in restricted bootstrap contexts.
    }
    return errorResponse(
      CRM_CONFIG.ERROR_CODES.UNKNOWN_ERROR,
      err && err.message ? err.message : 'Unexpected error. Please contact an administrator.'
    );
  }

  function paginate(items, pagination) {
    var allowed = CRM_CONFIG.PAGINATION.ALLOWED_PAGE_SIZES;
    var page = Math.max(1, parseInt(pagination && pagination.page, 10) || 1);
    var pageSize = parseInt(pagination && pagination.pageSize, 10) || CRM_CONFIG.PAGINATION.DEFAULT_PAGE_SIZE;
    if (allowed.indexOf(pageSize) === -1) pageSize = CRM_CONFIG.PAGINATION.DEFAULT_PAGE_SIZE;
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages
    };
  }

  function compareDescByDate(a, b, fieldName) {
    var left = Date.parse(a[fieldName] || '') || 0;
    var right = Date.parse(b[fieldName] || '') || 0;
    return right - left;
  }

  function makeCacheKey(prefix, payload) {
    var raw = prefix + ':' + JSON.stringify(payload || {});
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
    return prefix + ':' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
  }

  function getCacheVersion() {
    return PropertiesService.getScriptProperties().getProperty('CACHE_VERSION') || '1';
  }

  function bumpCacheVersion() {
    PropertiesService.getScriptProperties().setProperty('CACHE_VERSION', String(Date.now()));
  }

  function coerceEmail(email) {
    return normalize(email);
  }

  function pick(record, headers) {
    var output = {};
    headers.forEach(function (header) {
      if (record && Object.prototype.hasOwnProperty.call(record, header)) {
        output[header] = record[header];
      }
    });
    return output;
  }

  function containsText(record, fields, query) {
    var needle = normalize(query);
    if (!needle) return true;
    return fields.some(function (field) {
      return normalize(record[field]).indexOf(needle) !== -1;
    });
  }

  return {
    getTimezone: getTimezone,
    nowIso: nowIso,
    formatDateTime: formatDateTime,
    normalize: normalize,
    isBlank: isBlank,
    asBoolean: asBoolean,
    toNumber: toNumber,
    safeJsonParse: safeJsonParse,
    parseJsonOrThrow: parseJsonOrThrow,
    stringifyJson: stringifyJson,
    padNumber: padNumber,
    createError: createError,
    validationError: validationError,
    notFound: notFound,
    success: success,
    errorResponse: errorResponse,
    handleError: handleError,
    paginate: paginate,
    compareDescByDate: compareDescByDate,
    makeCacheKey: makeCacheKey,
    getCacheVersion: getCacheVersion,
    bumpCacheVersion: bumpCacheVersion,
    coerceEmail: coerceEmail,
    pick: pick,
    containsText: containsText
  };
})();
