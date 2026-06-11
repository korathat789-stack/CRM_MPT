var DriveLibraryService = (function () {
  function getConfiguredLibraries() {
    return DbService.readTable(CRM_CONFIG.SHEETS.CATALOGUES)
      .filter(function (library) {
        return UtilService.asBoolean(library.IsActive);
      })
      .sort(function (a, b) {
        return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
      })
      .map(function (library) {
        return {
          LibraryKey: library.LibraryKey,
          DisplayName: library.DisplayName,
          Category: library.Category || '',
          SortOrder: Number(library.SortOrder || 0)
        };
      });
  }

  function getLibraryRecord_(folderIdOrKey) {
    var libraries = DbService.readTable(CRM_CONFIG.SHEETS.CATALOGUES).filter(function (library) {
      return UtilService.asBoolean(library.IsActive);
    });
    for (var i = 0; i < libraries.length; i++) {
      if (libraries[i].LibraryKey === folderIdOrKey || libraries[i].FolderId === folderIdOrKey) return libraries[i];
    }
    return null;
  }

  function classifyDriveError_(err) {
    var message = err && err.message ? err.message : String(err);
    if (UtilService.normalize(message).indexOf('quota') !== -1) {
      return CRM_CONFIG.ERROR_CODES.QUOTA_ERROR;
    }
    return CRM_CONFIG.ERROR_CODES.DRIVE_ERROR;
  }

  function formatSize_(bytes) {
    var size = Number(bytes || 0);
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
    return (size / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }

  function getLibraryFiles(user, folderIdOrKey) {
    var library = getLibraryRecord_(folderIdOrKey);
    if (!library) throw UtilService.notFound('Catalogue library');
    if (UtilService.isBlank(library.FolderId) || String(library.FolderId).indexOf('REPLACE_WITH_') === 0) {
      throw UtilService.createError(
        CRM_CONFIG.ERROR_CODES.DRIVE_ERROR,
        'This catalogue folder is not configured yet. Please update the FolderId in the Catalogues sheet.'
      );
    }

    try {
      var folder = DriveApp.getFolderById(library.FolderId);
      var files = [];
      var iterator = folder.getFiles();
      while (iterator.hasNext()) {
        var file = iterator.next();
        files.push({
          FileName: file.getName(),
          FileType: file.getMimeType(),
          LastUpdated: UtilService.formatDateTime(file.getLastUpdated()),
          SizeBytes: file.getSize(),
          SizeLabel: formatSize_(file.getSize()),
          Url: file.getUrl(),
          Category: library.Category || ''
        });
      }
      files.sort(function (a, b) {
        return String(a.FileName).localeCompare(String(b.FileName));
      });
      return {
        library: {
          LibraryKey: library.LibraryKey,
          DisplayName: library.DisplayName,
          Category: library.Category || ''
        },
        files: files
      };
    } catch (err) {
      var code = classifyDriveError_(err);
      AuditService.logAction(
        CRM_CONFIG.AUDIT_ACTIONS.DRIVE_ERROR,
        'Catalogue',
        library.LibraryKey,
        {},
        { error: err && err.message ? err.message : String(err) },
        user.email,
        'DriveApp.getFolderById'
      );
      throw UtilService.createError(
        code,
        code === CRM_CONFIG.ERROR_CODES.QUOTA_ERROR
          ? 'Google Drive quota was reached. Please try again later.'
          : 'Unable to read this Google Drive folder. Please check the folder ID and sharing permissions.'
      );
    }
  }

  return {
    getLibraryFiles: getLibraryFiles,
    getConfiguredLibraries: getConfiguredLibraries
  };
})();
