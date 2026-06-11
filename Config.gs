var CRM_CONFIG = (function () {
  var APP = {
    NAME: 'MATCHPOINT CRM',
    COMPANY_NAME: 'MATCHPOINT TECHNOLOGY CO., LTD.',
    DEFAULT_TIMEZONE: 'Asia/Bangkok',
    FIRST_ADMIN_EMAIL: 'admin@matchpoint.co.th',
    ALLOWED_DOMAIN: 'matchpoint.co.th'
  };

  var SHEETS = {
    USERS: 'Users',
    CUSTOMERS: 'Customers',
    PROJECTS: 'Projects',
    WORKFLOW_STATES: 'WorkflowStates',
    SETTINGS: 'Settings',
    AUDIT_LOGS: 'AuditLogs',
    CATALOGUES: 'Catalogues'
  };

  var ROLES = {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    SALES: 'Sales'
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
    CREATE_CUSTOMER: 'CREATE_CUSTOMER',
    UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
    DELETE_CUSTOMER: 'DELETE_CUSTOMER',
    CREATE_PROJECT: 'CREATE_PROJECT',
    UPDATE_PROJECT: 'UPDATE_PROJECT',
    DELETE_PROJECT: 'DELETE_PROJECT',
    CHANGE_PROJECT_STATUS: 'CHANGE_PROJECT_STATUS',
    ACCESS_DENIED: 'ACCESS_DENIED',
    DRIVE_ERROR: 'DRIVE_ERROR',
    SAVE_USER: 'SAVE_USER',
    DELETE_USER: 'DELETE_USER',
    SAVE_SETTING: 'SAVE_SETTING'
  };

  var HEADERS = {};
  HEADERS[SHEETS.USERS] = [
    'Email',
    'Role',
    'FullName',
    'Department',
    'IsActive',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy'
  ];
  HEADERS[SHEETS.CUSTOMERS] = [
    'CustomerID',
    'CompanyName',
    'ContactPerson',
    'Phone',
    'Email',
    'Address',
    'TaxID',
    'CustomerType',
    'Industry',
    'OwnerEmail',
    'Notes',
    'IsDeleted',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy',
    'RowVersion'
  ];
  HEADERS[SHEETS.PROJECTS] = [
    'ProjectID',
    'CustomerID',
    'ProjectName',
    'ResponsibleDept',
    'AssignedSalesEmail',
    'ProjectValue',
    'Status',
    'StatusDetails',
    'ExpectedCloseDate',
    'Priority',
    'Probability',
    'Notes',
    'IsDeleted',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy',
    'RowVersion'
  ];
  HEADERS[SHEETS.WORKFLOW_STATES] = [
    'StateCode',
    'StateName',
    'SortOrder',
    'RequiredFieldsJson',
    'AllowedNextStatesJson',
    'IsTerminal',
    'IsActive'
  ];
  HEADERS[SHEETS.SETTINGS] = [
    'Key',
    'Value',
    'Description',
    'UpdatedAt',
    'UpdatedBy'
  ];
  HEADERS[SHEETS.AUDIT_LOGS] = [
    'AuditID',
    'Timestamp',
    'ActorEmail',
    'Action',
    'EntityType',
    'EntityID',
    'BeforeJson',
    'AfterJson',
    'IpOrContext'
  ];
  HEADERS[SHEETS.CATALOGUES] = [
    'LibraryKey',
    'DisplayName',
    'FolderId',
    'Category',
    'IsActive',
    'SortOrder',
    'UpdatedAt',
    'UpdatedBy'
  ];

  var CUSTOMER_TYPES = [
    'ราชการ',
    'ตัวแทนจำหน่าย',
    'ผู้ใช้งาน',
    'เอกชน',
    'อื่นๆ'
  ];

  var PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

  var WORKFLOW_DEFAULTS = [
    {
      StateCode: 'LEAD_CONTACT',
      StateName: 'รอฝ่ายขายติดต่อ',
      SortOrder: 10,
      RequiredFieldsJson: '["LeadSource"]',
      AllowedNextStatesJson: '["SOLUTION_PRESENTED","CANCELLED"]',
      IsTerminal: false,
      IsActive: true
    },
    {
      StateCode: 'SOLUTION_PRESENTED',
      StateName: 'ฝ่ายขายนำเสนอสินค้าและ Solution',
      SortOrder: 20,
      RequiredFieldsJson: '["SolutionType"]',
      AllowedNextStatesJson: '["QUOTATION_PREPARING","CANCELLED"]',
      IsTerminal: false,
      IsActive: true
    },
    {
      StateCode: 'QUOTATION_PREPARING',
      StateName: 'กำลังทำใบเสนอราคา',
      SortOrder: 30,
      RequiredFieldsJson: '["EstimatedValue"]',
      AllowedNextStatesJson: '["QUOTATION_SENT","CANCELLED"]',
      IsTerminal: false,
      IsActive: true
    },
    {
      StateCode: 'QUOTATION_SENT',
      StateName: 'ส่งใบเสนอราคาแล้ว',
      SortOrder: 40,
      RequiredFieldsJson: '["OfferedPrice","CustomerFeedback","ExpectedDeliveryDate"]',
      AllowedNextStatesJson: '["PROCUREMENT","CANCELLED"]',
      IsTerminal: false,
      IsActive: true
    },
    {
      StateCode: 'PROCUREMENT',
      StateName: 'กำลังจัดซื้อ',
      SortOrder: 50,
      RequiredFieldsJson: '["FinalPrice","PONumber","QuotationNumber","ContractStatus"]',
      AllowedNextStatesJson: '["COMPLETED","CANCELLED"]',
      IsTerminal: false,
      IsActive: true
    },
    {
      StateCode: 'COMPLETED',
      StateName: 'เสร็จสิ้น',
      SortOrder: 60,
      RequiredFieldsJson: '[]',
      AllowedNextStatesJson: '[]',
      IsTerminal: true,
      IsActive: true
    },
    {
      StateCode: 'CANCELLED',
      StateName: 'ยกเลิกโครงการ',
      SortOrder: 70,
      RequiredFieldsJson: '["CancelReason"]',
      AllowedNextStatesJson: '[]',
      IsTerminal: true,
      IsActive: true
    }
  ];

  var DEFAULT_SETTINGS = [
    {
      Key: 'APP_NAME',
      Value: APP.NAME,
      Description: 'Application display name'
    },
    {
      Key: 'COMPANY_NAME',
      Value: APP.COMPANY_NAME,
      Description: 'Company display name'
    },
    {
      Key: 'ALLOWED_DOMAIN',
      Value: APP.ALLOWED_DOMAIN,
      Description: 'Allowed Google Workspace email domain'
    },
    {
      Key: 'CATALOGUE_ROOT_FOLDER_ID',
      Value: '',
      Description: 'Optional root Google Drive folder for catalogue files'
    },
    {
      Key: 'DEFAULT_TIMEZONE',
      Value: APP.DEFAULT_TIMEZONE,
      Description: 'Default date/timezone for CRM data'
    },
    {
      Key: 'ADMIN_ALERT_EMAIL',
      Value: APP.FIRST_ADMIN_EMAIL,
      Description: 'Email address for admin alerts'
    }
  ];

  var STATUS_FIELD_CONFIG = {
    LEAD_CONTACT: [
      { key: 'LeadSource', label: 'Lead Source', type: 'text' }
    ],
    SOLUTION_PRESENTED: [
      {
        key: 'SolutionType',
        label: 'Solution Type',
        type: 'select',
        options: ['Warehouse', 'Inventory', 'Asset', 'Transportation', 'Indoor', 'Other']
      }
    ],
    QUOTATION_PREPARING: [
      { key: 'EstimatedValue', label: 'Estimated Value', type: 'number' }
    ],
    QUOTATION_SENT: [
      { key: 'OfferedPrice', label: 'Offered Price', type: 'number' },
      { key: 'CustomerFeedback', label: 'Customer Feedback', type: 'textarea' },
      { key: 'ExpectedDeliveryDate', label: 'Expected Delivery Date', type: 'date' }
    ],
    PROCUREMENT: [
      { key: 'FinalPrice', label: 'Final Price', type: 'number' },
      { key: 'PONumber', label: 'PO Number', type: 'text' },
      { key: 'QuotationNumber', label: 'Quotation Number', type: 'text' },
      {
        key: 'ContractStatus',
        label: 'Contract Status',
        type: 'select',
        options: ['รอจ่ายมัดจำ', 'กำลังดำเนินงาน', 'ชำระงวด 2/3', 'ปิดงานแล้ว']
      }
    ],
    CANCELLED: [
      { key: 'CancelReason', label: 'Cancel Reason', type: 'textarea' }
    ]
  };

  return {
    APP: APP,
    SHEETS: SHEETS,
    ROLES: ROLES,
    ERROR_CODES: ERROR_CODES,
    AUDIT_ACTIONS: AUDIT_ACTIONS,
    HEADERS: HEADERS,
    CUSTOMER_TYPES: CUSTOMER_TYPES,
    PRIORITIES: PRIORITIES,
    WORKFLOW_DEFAULTS: WORKFLOW_DEFAULTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    STATUS_FIELD_CONFIG: STATUS_FIELD_CONFIG,
    PAGINATION: {
      DEFAULT_PAGE_SIZE: 25,
      ALLOWED_PAGE_SIZES: [10, 25, 50, 100]
    },
    CACHE: {
      DASHBOARD_TTL_SECONDS: 300,
      REFERENCE_TTL_SECONDS: 600
    }
  };
})();
