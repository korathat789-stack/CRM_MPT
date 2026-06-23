-- ============================================================
-- MATCHPOINT CRM – Supabase schema (migration 001)
-- ============================================================

-- ---- Extensions ----
create extension if not exists "uuid-ossp";

-- ============================
-- PROFILES (extends auth.users)
-- ============================
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text unique not null,
  "Username"     text unique not null,
  "FullName"     text not null default '',
  "Role"         text not null default 'Sales'
                   check ("Role" in ('Admin','Manager','Sales')),
  "Department"   text not null default '',
  "IsActive"     boolean not null default true,
  "MustChangePassword" boolean not null default true,
  "LastLoginAt"  timestamptz,
  "CreatedAt"    timestamptz not null default now(),
  "UpdatedAt"    timestamptz not null default now(),
  "IsDeleted"    boolean not null default false
);

-- Auto-create profile on Supabase Auth signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, "Username", "Role", "MustChangePassword")
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'Sales'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RPC: look up email by username (called before login)
create or replace function get_email_by_username(p_username text)
returns text language sql security definer as $$
  select email from profiles
  where lower("Username") = lower(p_username)
    and "IsActive" = true
    and "IsDeleted" = false
  limit 1;
$$;

-- ============================
-- CUSTOMERS
-- ============================
create table if not exists customers (
  id                 uuid primary key default uuid_generate_v4(),
  "CustomerCode"     text unique,
  "CustomerType"     text not null default '',
  "CompanyNameTH"    text not null,
  "CompanyNameEN"    text not null default '',
  "TaxID"            text not null default '',
  "Industry"         text not null default '',
  "Phone"            text not null default '',
  "Email"            text not null default '',
  "LINE"             text not null default '',
  "Address"          text not null default '',
  "Province"         text not null default '',
  "CustomerStatus"   text not null default 'Active',
  "OwnerUserID"      uuid references profiles(id),
  "CreditTermDays"   numeric not null default 0,
  "CreditLimit"      numeric not null default 0,
  "Notes"            text not null default '',
  "CreatedAt"        timestamptz not null default now(),
  "CreatedBy"        text not null default '',
  "UpdatedAt"        timestamptz not null default now(),
  "UpdatedBy"        text not null default '',
  "RecordVersion"    integer not null default 1,
  "IsDeleted"        boolean not null default false
);

-- ============================
-- CONTACTS
-- ============================
create table if not exists contacts (
  id               uuid primary key default uuid_generate_v4(),
  "CustomerID"     uuid references customers(id),
  "Prefix"         text not null default '',
  "FirstName"      text not null,
  "LastName"       text not null default '',
  "Position"       text not null default '',
  "Department"     text not null default '',
  "Phone"          text not null default '',
  "Mobile"         text not null default '',
  "Email"          text not null default '',
  "LINE"           text not null default '',
  "IsPrimary"      boolean not null default false,
  "Notes"          text not null default '',
  "CreatedAt"      timestamptz not null default now(),
  "CreatedBy"      text not null default '',
  "UpdatedAt"      timestamptz not null default now(),
  "UpdatedBy"      text not null default '',
  "RecordVersion"  integer not null default 1,
  "IsDeleted"      boolean not null default false
);

-- ============================
-- OPPORTUNITIES
-- ============================
create table if not exists opportunities (
  id                    uuid primary key default uuid_generate_v4(),
  "OpportunityCode"     text unique,
  "CustomerID"          uuid references customers(id),
  "OpportunityName"     text not null,
  "Source"              text not null default '',
  "OwnerUserID"         uuid references profiles(id),
  "Stage"               text not null default 'NEW_INQUIRY',
  "Probability"         numeric not null default 0,
  "EstimatedValue"      numeric not null default 0,
  "ExpectedCloseDate"   date,
  "NextFollowUpDate"    date,
  "Competitor"          text not null default '',
  "LostReason"          text not null default '',
  "Notes"               text not null default '',
  "CreatedAt"           timestamptz not null default now(),
  "CreatedBy"           text not null default '',
  "UpdatedAt"           timestamptz not null default now(),
  "UpdatedBy"           text not null default '',
  "RecordVersion"       integer not null default 1,
  "IsDeleted"           boolean not null default false
);

-- ============================
-- ACTIVITIES
-- ============================
create table if not exists activities (
  id                    uuid primary key default uuid_generate_v4(),
  "CustomerID"          uuid references customers(id),
  "OpportunityID"       uuid references opportunities(id),
  "ActivityType"        text not null,
  "Subject"             text not null,
  "Description"         text not null default '',
  "ActivityDate"        date,
  "DueDate"             date,
  "CompletedDate"       date,
  "ActivityStatus"      text not null default 'Open',
  "Priority"            text not null default 'Medium',
  "AssignedToUserID"    uuid references profiles(id),
  "Outcome"             text not null default '',
  "CreatedAt"           timestamptz not null default now(),
  "CreatedBy"           text not null default '',
  "UpdatedAt"           timestamptz not null default now(),
  "UpdatedBy"           text not null default '',
  "RecordVersion"       integer not null default 1,
  "IsDeleted"           boolean not null default false
);

-- ============================
-- PRODUCTS
-- ============================
create table if not exists products (
  id                uuid primary key default uuid_generate_v4(),
  "ProductCode"     text unique,
  "ProductName"     text not null,
  "ProductCategory" text not null default '',
  "Unit"            text not null,
  "StandardPrice"   numeric not null default 0,
  "CostPrice"       numeric not null default 0,
  "IsActive"        boolean not null default true,
  "Description"     text not null default '',
  "CreatedAt"       timestamptz not null default now(),
  "CreatedBy"       text not null default '',
  "UpdatedAt"       timestamptz not null default now(),
  "UpdatedBy"       text not null default '',
  "RecordVersion"   integer not null default 1,
  "IsDeleted"       boolean not null default false
);

-- ============================
-- QUOTATIONS
-- ============================
create table if not exists quotations (
  id                   uuid primary key default uuid_generate_v4(),
  "QuotationNumber"    text unique,
  "CustomerID"         uuid references customers(id),
  "OpportunityID"      uuid references opportunities(id),
  "IssueDate"          date,
  "ExpiryDate"         date,
  "Status"             text not null default 'Draft',
  "Subtotal"           numeric not null default 0,
  "Discount"           numeric not null default 0,
  "VAT"                numeric not null default 0,
  "GrandTotal"         numeric not null default 0,
  "TermsAndConditions" text not null default '',
  "CreatedAt"          timestamptz not null default now(),
  "CreatedBy"          text not null default '',
  "UpdatedAt"          timestamptz not null default now(),
  "UpdatedBy"          text not null default '',
  "RecordVersion"      integer not null default 1,
  "IsDeleted"          boolean not null default false
);

-- ============================
-- INVOICES
-- ============================
create table if not exists invoices (
  id                   uuid primary key default uuid_generate_v4(),
  "InvoiceNumber"      text unique,
  "CustomerID"         uuid references customers(id),
  "InvoiceDate"        date,
  "DueDate"            date,
  "InvoiceStatus"      text not null default 'Draft',
  "Subtotal"           numeric not null default 0,
  "Discount"           numeric not null default 0,
  "VAT"                numeric not null default 0,
  "GrandTotal"         numeric not null default 0,
  "PaidAmount"         numeric not null default 0,
  "OutstandingAmount"  numeric not null default 0,
  "PaymentStatus"      text not null default 'Unpaid',
  "CreatedAt"          timestamptz not null default now(),
  "CreatedBy"          text not null default '',
  "UpdatedAt"          timestamptz not null default now(),
  "UpdatedBy"          text not null default '',
  "RecordVersion"      integer not null default 1,
  "IsDeleted"          boolean not null default false
);

-- ============================
-- PAYMENTS
-- ============================
create table if not exists payments (
  id                  uuid primary key default uuid_generate_v4(),
  "ReceiptNumber"     text unique,
  "CustomerID"        uuid references customers(id),
  "PaymentDate"       date,
  "PaymentMethod"     text not null default '',
  "ReceivedAmount"    numeric not null default 0,
  "BankReference"     text not null default '',
  "Notes"             text not null default '',
  "CreatedAt"         timestamptz not null default now(),
  "CreatedBy"         text not null default '',
  "UpdatedAt"         timestamptz not null default now(),
  "UpdatedBy"         text not null default '',
  "RecordVersion"     integer not null default 1,
  "IsDeleted"         boolean not null default false
);

-- ============================
-- SETTINGS
-- ============================
create table if not exists settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('APP_NAME',          'MATCHPOINT CRM'),
  ('COMPANY_NAME',      'MATCHPOINT TECHNOLOGY CO., LTD.'),
  ('DEFAULT_CURRENCY',  'THB'),
  ('VAT_RATE',          '0.07')
on conflict (key) do nothing;

-- ============================
-- AUDIT LOGS
-- ============================
create table if not exists audit_logs (
  id            uuid primary key default uuid_generate_v4(),
  "Timestamp"   timestamptz not null default now(),
  "UserEmail"   text not null default '',
  "Action"      text not null default '',
  "EntityType"  text not null default '',
  "EntityID"    text not null default '',
  "Details"     jsonb not null default '{}'
);

-- ============================
-- ROW LEVEL SECURITY
-- ============================
alter table profiles      enable row level security;
alter table customers     enable row level security;
alter table contacts      enable row level security;
alter table opportunities enable row level security;
alter table activities    enable row level security;
alter table products      enable row level security;
alter table quotations    enable row level security;
alter table invoices      enable row level security;
alter table payments      enable row level security;
alter table settings      enable row level security;
alter table audit_logs    enable row level security;

-- Profiles: all authenticated users can read; only admins can write
create policy "profiles_read"   on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (
  (select "Role" from profiles where id = auth.uid()) = 'Admin'
  or id = auth.uid()
);
create policy "profiles_update" on profiles for update to authenticated using (
  (select "Role" from profiles where id = auth.uid()) = 'Admin'
  or id = auth.uid()
);

-- Helper function used in policies
create or replace function crm_role()
returns text language sql security definer stable as $$
  select "Role" from profiles where id = auth.uid() limit 1;
$$;

-- Customers: elevated see all, sales see own
create policy "customers_read" on customers for select to authenticated using (
  not "IsDeleted" and (
    crm_role() in ('Admin','Manager')
    or "OwnerUserID" = auth.uid()
  )
);
create policy "customers_write" on customers for insert to authenticated with check (true);
create policy "customers_update" on customers for update to authenticated using (
  crm_role() in ('Admin','Manager') or "OwnerUserID" = auth.uid()
);
create policy "customers_delete" on customers for delete to authenticated using (
  crm_role() = 'Admin'
);

-- Products: all can read active; elevated manage
create policy "products_read" on products for select to authenticated using (not "IsDeleted");
create policy "products_write" on products for all to authenticated using (
  crm_role() in ('Admin','Manager')
) with check (crm_role() in ('Admin','Manager'));

-- Generic read/write for remaining entities (app-layer handles finer access)
do $$ begin
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'contacts');
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'opportunities');
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'activities');
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'quotations');
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'invoices');
  execute format($p$
    create policy %1$s_read  on %1$s for select to authenticated using (not "IsDeleted");
    create policy %1$s_insert on %1$s for insert to authenticated with check (true);
    create policy %1$s_update on %1$s for update to authenticated using (true);
    create policy %1$s_delete on %1$s for delete to authenticated using (crm_role() = 'Admin');
  $p$, 'payments');
end $$;

-- Settings: admin only
create policy "settings_read"  on settings for select to authenticated using (crm_role() = 'Admin');
create policy "settings_write" on settings for all  to authenticated using (crm_role() = 'Admin') with check (crm_role() = 'Admin');

-- Audit logs: admin reads; everyone can insert
create policy "audit_read"   on audit_logs for select to authenticated using (crm_role() = 'Admin');
create policy "audit_insert" on audit_logs for insert to authenticated with check (true);
