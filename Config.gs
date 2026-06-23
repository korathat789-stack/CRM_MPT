var CRM_CONFIG = (function () {
  var APP = {
    NAME: 'MATCHPOINT CRM',
    COMPANY_NAME: 'MATCHPOINT TECHNOLOGY CO., LTD.',
    VERSION: '1.0.0',
    SCHEMA_VERSION: '2026.06.19',
    DEFAULT_TIMEZONE: 'Asia/Bangkok',
    BOOTSTRAP_ADMIN_USERNAME: 'admin'
  };

  var ROLES = {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    SALES: 'Sales'
  };

  var SHEETS = {
    USERS: 'Users',
    CUSTOMERS: 'Customers',
    CONTACTS: 'Contacts',
    OPPORTUNITIES: 'Opportunities',
    PROJECTS: 'Opportunities',
    ACTIVITIES: 'Activities',
    PRODUCTS: 'Products',
    QUOTATIONS: 'Quotations',
    QUOTATION_ITEMS: 'QuotationItems',
    SALES_ORDERS: 'SalesOrders',
    SALES_ORDER_ITEMS: 'SalesOrderItems',
    INVOICES: 'Invoices',
    INVOICE_ITEMS: 'InvoiceItems',
    PAYMENTS: 'Payments',
    PAYMENT_ALLOCATIONS: 'PaymentAllocations',
    NOTIFICATIONS: 'Notifications',
    AUDIT_LOGS: 'AuditLogs',
    SETTINGS: 'Settings',
    PIPELINE_STAGES: 'PipelineStages',
    WORKFLOW_STATES: 'PipelineStages',
    MIGRATION_RUNS: 'MigrationRuns',
    MIGRATION_ERRORS: 'MigrationErrors',
    TRIGGER_RUNS: 'TriggerRuns',
    CATALOGUES: 'Catalogues'
  };

  var ERROR_CODES = {
    ACCESS_DENIED: 'ACCESS_DENIED',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    VERSION_CONFLICT: 'VERSION_CONFLICT',
    DRIVE_ERROR: 'DRIVE_ERROR',
    SHEET_ERROR: 'SHEET_ERROR',
    QUOTA_ERROR: 'QUOTA_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  };

  var AUDIT_ACTIONS = {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    ACCESS_DENIED: 'ACCESS_DENIED',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    RESTORE: 'RESTORE',
    EXPORT: 'EXPORT',
    MIGRATION_PREVIEW: 'MIGRATION_PREVIEW',
    MIGRATION_IMPORT: 'MIGRATION_IMPORT',
    MIGRATION_ROLLBACK: 'MIGRATION_ROLLBACK',
    SAVE_USER: 'SAVE_USER',
    DELETE_USER: 'DELETE_USER',
    SAVE_SETTING: 'SAVE_SETTING',
    INSTALL_TRIGGER: 'INSTALL_TRIGGER',
    REMOVE_TRIGGER: 'REMOVE_TRIGGER',
    HEALTH_CHECK: 'HEALTH_CHECK',
    TEST_RUN: 'TEST_RUN',
    DRIVE_ERROR: 'DRIVE_ERROR'
  };

  var HEADERS = {};
  HEADERS[SHEETS.USERS] = [
    'UserID', 'Email', 'Username', 'FullName', 'Role', 'Department', 'ManagerUserID',
    'IsActive', 'PasswordHash', 'PasswordSalt', 'MustChangePassword', 'PasswordUpdatedAt',
    'LastLoginAt', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.CUSTOMERS] = [
    'CustomerID', 'CustomerCode', 'CustomerType', 'CompanyNameTH', 'CompanyNameEN', 'TaxID',
    'BranchCode', 'Industry', 'Website', 'Phone', 'Email', 'LINE', 'Address', 'Province',
    'PostalCode', 'CustomerSource', 'CustomerStatus', 'OwnerUserID', 'CreditTermDays',
    'CreditLimit', 'Notes', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy',
    'RecordVersion', 'IsDeleted', 'ExternalSourceKey'
  ];
  HEADERS[SHEETS.CONTACTS] = [
    'ContactID', 'CustomerID', 'Prefix', 'FirstName', 'LastName', 'Position', 'Department',
    'Phone', 'Mobile', 'Email', 'LINE', 'IsPrimary', 'Notes', 'CreatedAt', 'CreatedBy',
    'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.OPPORTUNITIES] = [
    'OpportunityID', 'OpportunityCode', 'CustomerID', 'ContactID', 'OpportunityName',
    'Source', 'OwnerUserID', 'Stage', 'Probability', 'EstimatedValue', 'ExpectedCloseDate',
    'LastContactDate', 'NextFollowUpDate', 'ProductCategory', 'Competitor', 'LostReason',
    'Notes', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'RecordVersion',
    'IsDeleted', 'ExternalSourceKey', 'MigrationRunID'
  ];
  HEADERS[SHEETS.ACTIVITIES] = [
    'ActivityID', 'CustomerID', 'ContactID', 'OpportunityID', 'ActivityType', 'Subject',
    'Description', 'ActivityDate', 'DueDate', 'CompletedDate', 'ActivityStatus', 'Priority',
    'AssignedToUserID', 'ReminderAt', 'Outcome', 'CreatedAt', 'CreatedBy', 'UpdatedAt',
    'UpdatedBy', 'RecordVersion', 'IsDeleted', 'ExternalSourceKey', 'MigrationRunID'
  ];
  HEADERS[SHEETS.PRODUCTS] = [
    'ProductID', 'ProductCode', 'ProductName', 'ProductCategory', 'Description', 'Unit',
    'StandardPrice', 'CostPrice', 'IsActive', 'CreatedAt', 'CreatedBy', 'UpdatedAt',
    'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.QUOTATIONS] = [
    'QuotationID', 'QuotationNumber', 'Version', 'CustomerID', 'OpportunityID',
    'IssueDate', 'ExpiryDate', 'Status', 'Currency', 'Subtotal', 'Discount',
    'VAT', 'WithholdingTax', 'GrandTotal', 'TermsAndConditions', 'ApprovedByUserID',
    'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.QUOTATION_ITEMS] = [
    'QuotationItemID', 'QuotationID', 'ProductID', 'Description', 'Quantity', 'Unit',
    'UnitPrice', 'Discount', 'VAT', 'Total', 'SortOrder', 'CreatedAt', 'CreatedBy',
    'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.SALES_ORDERS] = [
    'SalesOrderID', 'SalesOrderNumber', 'CustomerPONumber', 'PODate', 'CustomerID',
    'OpportunityID', 'QuotationID', 'OrderStatus', 'DeliveryDate', 'Subtotal',
    'Discount', 'VAT', 'GrandTotal', 'DeliveryStatus', 'InvoiceStatus', 'PaymentStatus',
    'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.SALES_ORDER_ITEMS] = [
    'SalesOrderItemID', 'SalesOrderID', 'QuotationItemID', 'ProductID', 'Description',
    'Quantity', 'Unit', 'UnitPrice', 'Discount', 'VAT', 'Total', 'DeliveryStatus',
    'InvoiceStatus', 'PaymentStatus', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy',
    'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.INVOICES] = [
    'InvoiceID', 'InvoiceNumber', 'CustomerID', 'SalesOrderID', 'InvoiceDate', 'DueDate',
    'InvoiceStatus', 'Subtotal', 'Discount', 'VAT', 'WithholdingTax', 'GrandTotal',
    'PaidAmount', 'OutstandingAmount', 'PaymentStatus', 'CreatedAt', 'CreatedBy',
    'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.INVOICE_ITEMS] = [
    'InvoiceItemID', 'InvoiceID', 'SalesOrderItemID', 'ProductID', 'Description',
    'Quantity', 'Unit', 'UnitPrice', 'Discount', 'VAT', 'Total', 'PaidAmount',
    'OutstandingAmount', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy',
    'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.PAYMENTS] = [
    'PaymentID', 'ReceiptNumber', 'CustomerID', 'PaymentDate', 'PaymentMethod',
    'BankReference', 'ReceivedAmount', 'BankFee', 'WithholdingTaxAmount',
    'NetReceivedAmount', 'UnallocatedAmount', 'PaymentStatus', 'Notes', 'CreatedAt',
    'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.PAYMENT_ALLOCATIONS] = [
    'AllocationID', 'PaymentID', 'InvoiceID', 'InvoiceItemID', 'SalesOrderItemID',
    'AllocatedAmount', 'AllocatedAt', 'AllocatedBy', 'CreatedAt', 'CreatedBy',
    'UpdatedAt', 'UpdatedBy', 'RecordVersion', 'IsDeleted'
  ];
  HEADERS[SHEETS.NOTIFICATIONS] = [
    'NotificationID', 'UserID', 'NotificationType', 'ReferenceType', 'ReferenceID',
    'Title', 'Message', 'Severity', 'IsRead', 'IdempotencyKey', 'ScheduledAt', 'SentAt',
    'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
  ];
  HEADERS[SHEETS.AUDIT_LOGS] = [
    'AuditID', 'Timestamp', 'UserID', 'UserEmail', 'Action', 'EntityType', 'EntityID',
    'PreviousValue', 'NewValue', 'RequestID', 'Result', 'ErrorMessage'
  ];
  HEADERS[SHEETS.SETTINGS] = [
    'Key', 'Value', 'Description', 'UpdatedAt', 'UpdatedBy'
  ];
  HEADERS[SHEETS.PIPELINE_STAGES] = [
    'StageCode', 'StageName', 'SortOrder', 'Probability', 'AllowedNextStagesJson',
    'IsTerminal', 'IsActive'
  ];
  HEADERS[SHEETS.MIGRATION_RUNS] = [
    'MigrationRunID', 'SourceWorkbook', 'SourceSheet', 'StartedAt', 'CompletedAt',
    'RunByUserID', 'Mode', 'RowsRead', 'RowsValid', 'RowsImported', 'RowsSkipped',
    'RowsFailed', 'Status', 'SummaryJson'
  ];
  HEADERS[SHEETS.MIGRATION_ERRORS] = [
    'MigrationErrorID', 'MigrationRunID', 'SourceRowNumber', 'FieldName', 'ErrorCode',
    'ErrorMessage', 'SourceHash', 'CreatedAt'
  ];
  HEADERS[SHEETS.TRIGGER_RUNS] = [
    'TriggerRunID', 'TriggerName', 'StartedAt', 'CompletedAt', 'RecordsChecked',
    'NotificationsCreated', 'EmailsSent', 'Errors', 'Status', 'DetailsJson'
  ];
  HEADERS[SHEETS.CATALOGUES] = [
    'LibraryKey', 'DisplayName', 'FolderId', 'Category', 'IsActive', 'SortOrder',
    'UpdatedAt', 'UpdatedBy'
  ];

  var PIPELINE_STAGES = [
    ['NEW_INQUIRY', 'New Inquiry', 10, 10, ['CONTACTED', 'CANCELLED']],
    ['CONTACTED', 'Contacted', 20, 20, ['QUALIFIED', 'LOST', 'CANCELLED']],
    ['QUALIFIED', 'Qualified', 30, 30, ['REQUIREMENT_CONFIRMED', 'LOST', 'CANCELLED']],
    ['REQUIREMENT_CONFIRMED', 'Requirement Confirmed', 40, 40, ['QUOTATION', 'LOST', 'CANCELLED']],
    ['QUOTATION', 'Quotation', 50, 55, ['NEGOTIATION', 'PURCHASE_ORDER_RECEIVED', 'LOST', 'CANCELLED']],
    ['NEGOTIATION', 'Negotiation', 60, 65, ['PURCHASE_ORDER_RECEIVED', 'LOST', 'CANCELLED']],
    ['PURCHASE_ORDER_RECEIVED', 'Purchase Order Received', 70, 75, ['ORDER_CONFIRMED', 'CANCELLED']],
    ['ORDER_CONFIRMED', 'Order Confirmed', 80, 80, ['DELIVERY_IMPLEMENTATION', 'INVOICED', 'CANCELLED']],
    ['DELIVERY_IMPLEMENTATION', 'Delivery / Implementation', 90, 85, ['INVOICED', 'CANCELLED']],
    ['INVOICED', 'Invoiced', 100, 90, ['PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']],
    ['PAYMENT_PENDING', 'Payment Pending', 110, 92, ['PARTIALLY_PAID', 'PAID', 'CANCELLED']],
    ['PARTIALLY_PAID', 'Partially Paid', 120, 95, ['PAID', 'CANCELLED']],
    ['PAID', 'Paid', 130, 100, ['WON']],
    ['WON', 'Won', 140, 100, []],
    ['LOST', 'Lost', 150, 0, []],
    ['CANCELLED', 'Cancelled', 160, 0, []]
  ].map(function (row) {
    return {
      StageCode: row[0],
      StageName: row[1],
      SortOrder: row[2],
      Probability: row[3],
      AllowedNextStagesJson: JSON.stringify(row[4]),
      IsTerminal: row[4].length === 0,
      IsActive: true
    };
  });

  var CUSTOMER_TYPES = ['ราชการ', 'ตัวแทนจำหน่าย', 'ผู้ใช้งาน', 'เอกชน', 'ทั่วไป-ขายต่อ', 'อื่นๆ'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  var ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'LINE', 'Site Visit', 'Demo', 'Proposal', 'Follow-up', 'Internal Note', 'Other'];
  var ACTIVITY_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled', 'Overdue'];
  var DOCUMENT_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Sent', 'Accepted', 'Rejected', 'Cancelled'];
  var ORDER_STATUSES = ['Draft', 'Confirmed', 'In Progress', 'Delivered', 'Closed', 'Cancelled'];
  var INVOICE_STATUSES = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
  var PAYMENT_STATUSES = ['Unallocated', 'Partially Allocated', 'Allocated', 'Reversed'];
  var CUSTOMER_STATUSES = ['Active', 'Inactive', 'Prospect', 'On Hold'];
  var PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'Credit Note', 'Other'];

  var SOURCE_STAGE_MAP = {
    'ขอราคา': 'NEW_INQUIRY',
    'ขอใบเสนอราคา': 'QUOTATION',
    'รอราคาเสนอ': 'QUOTATION',
    'เสนอราคา': 'QUOTATION',
    'ใบเสนอราคา': 'QUOTATION',
    'online present': 'CONTACTED',
    'Online present': 'CONTACTED',
    'Zoom แล้ว': 'CONTACTED',
    'รอนัด Zoom': 'CONTACTED',
    'รอส่งของ': 'DELIVERY_IMPLEMENTATION',
    'ปิด': 'WON'
  };

  var ENTITY_CONFIG = {
    customers: {
      sheet: SHEETS.CUSTOMERS,
      key: 'CustomerID',
      prefix: 'CUST',
      numberField: 'CustomerCode',
      numberPrefix: 'CUST',
      label: 'Customers',
      ownerField: 'OwnerUserID',
      required: ['CompanyNameTH', 'OwnerUserID'],
      searchable: ['CustomerCode', 'CompanyNameTH', 'CompanyNameEN', 'TaxID', 'Phone', 'Email', 'Industry'],
      numeric: ['CreditTermDays', 'CreditLimit'],
      booleans: ['IsDeleted'],
      enums: { CustomerType: CUSTOMER_TYPES, CustomerStatus: CUSTOMER_STATUSES },
      unique: ['CustomerCode', 'TaxID']
    },
    contacts: {
      sheet: SHEETS.CONTACTS,
      key: 'ContactID',
      prefix: 'CONT',
      label: 'Contacts',
      parentField: 'CustomerID',
      required: ['CustomerID', 'FirstName'],
      searchable: ['FirstName', 'LastName', 'Position', 'Phone', 'Mobile', 'Email', 'LINE'],
      booleans: ['IsPrimary', 'IsDeleted']
    },
    opportunities: {
      sheet: SHEETS.OPPORTUNITIES,
      key: 'OpportunityID',
      prefix: 'OPP',
      numberField: 'OpportunityCode',
      numberPrefix: 'OPP',
      label: 'Opportunities',
      ownerField: 'OwnerUserID',
      parentField: 'CustomerID',
      required: ['CustomerID', 'OpportunityName', 'OwnerUserID', 'Stage'],
      searchable: ['OpportunityCode', 'OpportunityName', 'Source', 'ProductCategory', 'Competitor', 'Notes'],
      numeric: ['Probability', 'EstimatedValue'],
      enums: { Stage: PIPELINE_STAGES.map(function (stage) { return stage.StageCode; }) },
      booleans: ['IsDeleted'],
      unique: ['OpportunityCode', 'ExternalSourceKey']
    },
    activities: {
      sheet: SHEETS.ACTIVITIES,
      key: 'ActivityID',
      prefix: 'ACT',
      label: 'Activities',
      ownerField: 'AssignedToUserID',
      parentField: 'CustomerID',
      required: ['CustomerID', 'ActivityType', 'Subject', 'ActivityDate', 'AssignedToUserID'],
      searchable: ['Subject', 'Description', 'Outcome'],
      enums: { ActivityType: ACTIVITY_TYPES, ActivityStatus: ACTIVITY_STATUSES, Priority: PRIORITIES },
      booleans: ['IsDeleted']
    },
    products: {
      sheet: SHEETS.PRODUCTS,
      key: 'ProductID',
      prefix: 'PROD',
      numberField: 'ProductCode',
      numberPrefix: 'PROD',
      label: 'Products',
      required: ['ProductName', 'Unit'],
      searchable: ['ProductCode', 'ProductName', 'ProductCategory', 'Description'],
      numeric: ['StandardPrice', 'CostPrice'],
      booleans: ['IsActive', 'IsDeleted'],
      costSensitiveFields: ['CostPrice'],
      unique: ['ProductCode']
    },
    quotations: {
      sheet: SHEETS.QUOTATIONS,
      key: 'QuotationID',
      prefix: 'QUO',
      numberField: 'QuotationNumber',
      numberPrefix: 'QT',
      label: 'Quotations',
      parentField: 'CustomerID',
      required: ['CustomerID', 'IssueDate', 'Status'],
      searchable: ['QuotationNumber', 'TermsAndConditions'],
      numeric: ['Version', 'Subtotal', 'Discount', 'VAT', 'WithholdingTax', 'GrandTotal'],
      enums: { Status: DOCUMENT_STATUSES },
      booleans: ['IsDeleted'],
      unique: ['QuotationNumber']
    },
    quotationItems: {
      sheet: SHEETS.QUOTATION_ITEMS,
      key: 'QuotationItemID',
      prefix: 'QTI',
      label: 'Quotation Items',
      parentField: 'QuotationID',
      required: ['QuotationID', 'Description'],
      searchable: ['Description'],
      numeric: ['Quantity', 'UnitPrice', 'Discount', 'VAT', 'Total', 'SortOrder'],
      booleans: ['IsDeleted']
    },
    salesOrders: {
      sheet: SHEETS.SALES_ORDERS,
      key: 'SalesOrderID',
      prefix: 'SO',
      numberField: 'SalesOrderNumber',
      numberPrefix: 'SO',
      label: 'Sales Orders',
      parentField: 'CustomerID',
      required: ['CustomerID', 'OrderStatus'],
      searchable: ['SalesOrderNumber', 'CustomerPONumber'],
      numeric: ['Subtotal', 'Discount', 'VAT', 'GrandTotal'],
      enums: { OrderStatus: ORDER_STATUSES, DeliveryStatus: ORDER_STATUSES, InvoiceStatus: INVOICE_STATUSES, PaymentStatus: INVOICE_STATUSES },
      booleans: ['IsDeleted'],
      unique: ['SalesOrderNumber']
    },
    salesOrderItems: {
      sheet: SHEETS.SALES_ORDER_ITEMS,
      key: 'SalesOrderItemID',
      prefix: 'SOI',
      label: 'Sales Order Items',
      parentField: 'SalesOrderID',
      required: ['SalesOrderID', 'Description'],
      searchable: ['Description'],
      numeric: ['Quantity', 'UnitPrice', 'Discount', 'VAT', 'Total'],
      booleans: ['IsDeleted']
    },
    invoices: {
      sheet: SHEETS.INVOICES,
      key: 'InvoiceID',
      prefix: 'INV',
      numberField: 'InvoiceNumber',
      numberPrefix: 'INV',
      label: 'Invoices',
      parentField: 'CustomerID',
      required: ['CustomerID', 'InvoiceDate', 'DueDate', 'InvoiceStatus'],
      searchable: ['InvoiceNumber'],
      numeric: ['Subtotal', 'Discount', 'VAT', 'WithholdingTax', 'GrandTotal', 'PaidAmount', 'OutstandingAmount'],
      enums: { InvoiceStatus: INVOICE_STATUSES, PaymentStatus: INVOICE_STATUSES },
      booleans: ['IsDeleted'],
      unique: ['InvoiceNumber']
    },
    invoiceItems: {
      sheet: SHEETS.INVOICE_ITEMS,
      key: 'InvoiceItemID',
      prefix: 'INI',
      label: 'Invoice Items',
      parentField: 'InvoiceID',
      required: ['InvoiceID', 'Description'],
      searchable: ['Description'],
      numeric: ['Quantity', 'UnitPrice', 'Discount', 'VAT', 'Total', 'PaidAmount', 'OutstandingAmount'],
      booleans: ['IsDeleted']
    },
    payments: {
      sheet: SHEETS.PAYMENTS,
      key: 'PaymentID',
      prefix: 'PAY',
      numberField: 'ReceiptNumber',
      numberPrefix: 'RCPT',
      label: 'Payments',
      parentField: 'CustomerID',
      required: ['CustomerID', 'PaymentDate', 'PaymentMethod', 'ReceivedAmount'],
      searchable: ['ReceiptNumber', 'BankReference', 'Notes'],
      numeric: ['ReceivedAmount', 'BankFee', 'WithholdingTaxAmount', 'NetReceivedAmount', 'UnallocatedAmount'],
      enums: { PaymentMethod: PAYMENT_METHODS, PaymentStatus: PAYMENT_STATUSES },
      booleans: ['IsDeleted'],
      unique: ['ReceiptNumber']
    },
    paymentAllocations: {
      sheet: SHEETS.PAYMENT_ALLOCATIONS,
      key: 'AllocationID',
      prefix: 'ALLOC',
      label: 'Payment Allocations',
      parentField: 'PaymentID',
      required: ['PaymentID', 'InvoiceID', 'AllocatedAmount'],
      searchable: ['PaymentID', 'InvoiceID'],
      numeric: ['AllocatedAmount'],
      booleans: ['IsDeleted']
    },
    notifications: {
      sheet: SHEETS.NOTIFICATIONS,
      key: 'NotificationID',
      prefix: 'NOTIF',
      label: 'Notifications',
      ownerField: 'UserID',
      required: ['UserID', 'Title', 'Message', 'Severity'],
      searchable: ['Title', 'Message', 'ReferenceType', 'ReferenceID'],
      booleans: ['IsRead']
    }
  };

  var DEFAULT_SETTINGS = [
    ['APP_NAME', APP.NAME, 'Application display name'],
    ['COMPANY_NAME', APP.COMPANY_NAME, 'Company display name'],
    ['DEFAULT_TIMEZONE', APP.DEFAULT_TIMEZONE, 'Default timezone'],
    ['SCHEMA_VERSION', APP.SCHEMA_VERSION, 'Database schema version'],
    ['DEFAULT_CURRENCY', 'THB', 'Default document currency'],
    ['VAT_RATE', '0.07', 'Default VAT rate'],
    ['WITHHOLDING_TAX_RATE', '0.03', 'Default withholding tax rate'],
    ['DRIVE_REPORT_FOLDER_ID', '', 'Drive folder for generated reports'],
    ['ADMIN_ALERT_EMAIL', '', 'Optional admin alert recipient'],
    ['EMAIL_NOTIFICATIONS_ENABLED', 'false', 'Enable outbound email notifications'],
    ['REMINDER_LOOKAHEAD_DAYS', '3', 'Days ahead for reminder notifications']
  ].map(function (row) {
    return { Key: row[0], Value: row[1], Description: row[2] };
  });

  return {
    APP: APP,
    SHEETS: SHEETS,
    ROLES: ROLES,
    ERROR_CODES: ERROR_CODES,
    AUDIT_ACTIONS: AUDIT_ACTIONS,
    HEADERS: HEADERS,
    ENTITY_CONFIG: ENTITY_CONFIG,
    PIPELINE_STAGES: PIPELINE_STAGES,
    CUSTOMER_TYPES: CUSTOMER_TYPES,
    PRIORITIES: PRIORITIES,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    ACTIVITY_STATUSES: ACTIVITY_STATUSES,
    DOCUMENT_STATUSES: DOCUMENT_STATUSES,
    ORDER_STATUSES: ORDER_STATUSES,
    INVOICE_STATUSES: INVOICE_STATUSES,
    PAYMENT_STATUSES: PAYMENT_STATUSES,
    CUSTOMER_STATUSES: CUSTOMER_STATUSES,
    PAYMENT_METHODS: PAYMENT_METHODS,
    SOURCE_STAGE_MAP: SOURCE_STAGE_MAP,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    PAGINATION: {
      DEFAULT_PAGE_SIZE: 25,
      ALLOWED_PAGE_SIZES: [10, 25, 50, 100, 250, 500, 1000]
    },
    CACHE: {
      DASHBOARD_TTL_SECONDS: 300,
      REFERENCE_TTL_SECONDS: 600
    }
  };
})();
