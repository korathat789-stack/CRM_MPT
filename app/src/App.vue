<template>
  <div>
    <!-- LOGIN -->
    <section v-if="!authChecked" class="min-h-screen">
      <div class="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
        <div class="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-lg font-black">MP</div>
            <div><div class="text-sm font-black tracking-wide">MATCHPOINT CRM</div><div class="text-xs text-slate-400">MATCHPOINT TECHNOLOGY CO., LTD.</div></div>
          </div>
          <h1 class="max-w-3xl text-4xl font-black leading-tight">Pipeline, collections, and follow-up work in one place.</h1>
          <div class="text-xs text-slate-500">Vue 3 · Supabase · Vercel</div>
        </div>
        <div class="flex items-center justify-center p-6">
          <div class="panel w-full max-w-md p-7">
            <h1 class="text-2xl font-black text-slate-950">Sign in</h1>
            <p class="mt-2 mb-6 text-sm text-slate-600">MATCHPOINT CRM</p>
            <form class="space-y-4" @submit.prevent="doLogin">
              <label><span class="label">Username or Email</span><input v-model.trim="loginForm.username" class="field" autocomplete="username" :disabled="loading"></label>
              <label><span class="label">Password</span><input v-model="loginForm.password" class="field" type="password" autocomplete="current-password" :disabled="loading"></label>
              <button type="submit" class="btn btn-primary w-full" :disabled="loading">
                <span v-if="loading" class="spinner"></span><i v-else class="fa-solid fa-right-to-bracket"></i> Sign In
              </button>
            </form>
            <div v-if="loginError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ loginError }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- APP -->
    <section v-else class="app-shell">
      <div v-if="mobileMenuOpen" class="mobile-scrim lg:hidden" @click="mobileMenuOpen=false"></div>
      <aside :class="['sidebar',{open:mobileMenuOpen}]">
        <div class="p-5"><div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-black">MP</div>
          <div class="min-w-0"><div class="truncate text-sm font-bold text-white">{{ settings.appName || 'MATCHPOINT CRM' }}</div><div class="truncate text-xs text-slate-400">{{ auth.fullName || auth.email }}</div></div>
        </div></div>
        <nav class="px-3 pb-4 space-y-1">
          <button v-for="item in navItems" :key="item.page" :class="['nav-button',{active:currentPage===item.page}]" @click="navigate(item.page)">
            <i :class="['fa-solid',item.icon,'w-5 text-center']"></i><span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="min-w-0">
        <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div class="flex min-h-16 items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div class="flex min-w-0 items-center gap-3">
              <button class="icon-btn lg:hidden" @click="mobileMenuOpen=true"><i class="fa-solid fa-bars"></i></button>
              <div class="min-w-0"><h1 class="truncate text-lg font-black md:text-xl">{{ pageTitle }}</h1><p class="truncate text-xs text-slate-500">{{ settings.companyName }}</p></div>
            </div>
            <div class="flex items-center gap-2">
              <span class="status-pill bg-blue-50 text-blue-700">{{ auth.role }}</span>
              <button class="icon-btn" title="Refresh" @click="refreshCurrent"><i class="fa-solid fa-rotate-right"></i></button>
              <button class="icon-btn" title="Sign out" @click="doLogout"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
            </div>
          </div>
        </header>

        <section class="p-4 md:p-6">
          <div v-if="loading" class="mb-4 flex items-center gap-2 text-sm text-slate-500"><span class="spinner"></span> Loading</div>

          <!-- DASHBOARD -->
          <section v-if="currentPage==='dashboard'" class="space-y-4">
            <div class="panel p-4"><div class="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
              <label><span class="label">Stage</span><select v-model="dashboardFilters.stage" class="field"><option value="">All</option><option v-for="s in lookups.pipelineStages" :key="s.StageCode" :value="s.StageCode">{{ s.StageName }}</option></select></label>
              <label><span class="label">Owner</span><select v-model="dashboardFilters.ownerUserId" class="field" :disabled="!permissions.canViewAll"><option value="">All</option><option v-for="u in lookups.users" :key="u.UserID" :value="u.UserID">{{ u.FullName }}</option></select></label>
              <div class="flex items-end gap-2"><button class="btn btn-primary" @click="loadDashboard"><i class="fa-solid fa-filter"></i>Apply</button><button class="btn btn-secondary" @click="resetDashboard"><i class="fa-solid fa-eraser"></i>Clear</button></div>
            </div></div>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <div v-for="card in dashboardCards" :key="card.label" class="panel p-4"><p class="text-xs font-bold uppercase text-slate-500">{{ card.label }}</p><p class="mt-2 text-2xl font-black">{{ card.value }}</p></div>
            </div>
            <div class="grid gap-4 xl:grid-cols-3">
              <div class="panel p-4"><h2 class="text-sm font-black">Pipeline Count</h2><div class="chart-box"><canvas id="pipelineChart"></canvas></div></div>
              <div class="panel p-4"><h2 class="text-sm font-black">Pipeline Value</h2><div class="chart-box"><canvas id="valueChart"></canvas></div></div>
              <div class="panel p-4"><h2 class="text-sm font-black">Collections</h2><div class="chart-box"><canvas id="collectionChart"></canvas></div></div>
            </div>
            <div class="grid gap-4 xl:grid-cols-2">
              <record-list title="Top Opportunities" :rows="dashboard.topOpportunities" :fields="['OpportunityCode','OpportunityName','Stage','EstimatedValue','ExpectedCloseDate']"></record-list>
              <record-list title="Overdue Invoices" :rows="dashboard.overdueInvoices" :fields="['InvoiceNumber','CustomerID','DueDate','OutstandingAmount','PaymentStatus']"></record-list>
            </div>
          </section>

          <!-- ENTITY LIST -->
          <section v-if="currentPage==='entity'" class="space-y-4">
            <div class="panel p-4"><div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_auto]">
              <input v-model="entityFilters.query" class="field" type="search" :placeholder="'Search '+activeSchema.label" @keyup.enter="loadEntity(1)">
              <select v-model.number="entityFilters.pageSize" class="field" @change="loadEntity(1)"><option :value="25">25 rows</option><option :value="50">50 rows</option><option :value="100">100 rows</option></select>
              <div class="flex gap-2"><button class="btn btn-secondary" @click="loadEntity(1)"><i class="fa-solid fa-magnifying-glass"></i>Search</button><button v-if="activeSchema.canCreate" class="btn btn-primary" @click="newRecord"><i class="fa-solid fa-plus"></i>New</button></div>
            </div></div>
            <div class="panel"><div class="table-wrap"><table>
              <thead><tr><th v-for="f in tableFields" :key="f">{{ f }}</th><th></th></tr></thead>
              <tbody>
                <tr v-for="row in entityRows.items" :key="row.id">
                  <td v-for="f in tableFields" :key="f">{{ displayValue(row[f]) }}</td>
                  <td class="text-right">
                    <button class="icon-btn" title="Edit" @click="editRecord(row.id)"><i class="fa-solid fa-pen"></i></button>
                    <button v-if="activeSchema.canDelete" class="icon-btn text-red-600" title="Delete" @click="removeRecord(row.id)"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
                <tr v-if="!entityRows.items.length"><td :colspan="tableFields.length+1" class="text-center text-slate-500">No records</td></tr>
              </tbody>
            </table></div>
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3">
              <span class="text-sm text-slate-500">Page {{ entityRows.page }} of {{ entityRows.totalPages }} · {{ entityRows.total }} records</span>
              <div class="flex gap-2"><button class="btn btn-secondary" :disabled="entityRows.page<=1" @click="loadEntity(entityRows.page-1)">Prev</button><button class="btn btn-secondary" :disabled="entityRows.page>=entityRows.totalPages" @click="loadEntity(entityRows.page+1)">Next</button></div>
            </div></div>
          </section>

          <!-- FORM -->
          <section v-if="currentPage==='form'" class="panel p-4">
            <form class="space-y-4" @submit.prevent="saveRecord">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-lg font-black">{{ recordForm.id ? 'Edit' : 'New' }} {{ activeSchema.label }}</h2>
                <div class="flex gap-2"><button type="button" class="btn btn-secondary" @click="currentPage='entity'"><i class="fa-solid fa-xmark"></i>Cancel</button><button type="submit" class="btn btn-primary" :disabled="loading"><i class="fa-solid fa-floppy-disk"></i>Save</button></div>
              </div>
              <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label v-for="field in editableFields" :key="field">
                  <span class="label">{{ field }} <span v-if="isRequired(field)" class="text-red-600">*</span></span>
                  <select v-if="fieldOptions(field).length" v-model="recordForm[field]" :class="fieldClass(field)"><option value=""></option><option v-for="o in fieldOptions(field)" :key="o.value" :value="o.value">{{ o.label }}</option></select>
                  <textarea v-else-if="fieldType(field)==='textarea'" v-model="recordForm[field]" :class="fieldClass(field)" rows="3"></textarea>
                  <input v-else-if="fieldType(field)==='checkbox'" v-model="recordForm[field]" class="h-5 w-5" type="checkbox">
                  <input v-else v-model="recordForm[field]" :class="fieldClass(field)" :type="fieldType(field)">
                  <span v-if="fieldError(field)" class="error-text">{{ fieldError(field) }}</span>
                </label>
              </div>
            </form>
          </section>

          <!-- REPORTS -->
          <section v-if="currentPage==='reports'" class="space-y-4">
            <div class="panel p-4"><div class="grid gap-3 md:grid-cols-5">
              <label><span class="label">Report</span><select v-model="reportType" class="field"><option value="pipeline">Pipeline</option><option value="collections">Collections</option><option value="activities">Activities</option></select></label>
              <label><span class="label">Search</span><input v-model="reportFilters.query" class="field" type="search"></label>
              <div class="flex items-end gap-2"><button class="btn btn-primary" @click="loadReport"><i class="fa-solid fa-table"></i>Run</button><button class="btn btn-secondary" @click="exportCsv"><i class="fa-solid fa-file-csv"></i>Export CSV</button></div>
            </div></div>
            <record-list title="Report Results" :rows="report.rows" :fields="report.headers"></record-list>
          </section>

          <!-- USERS -->
          <section v-if="currentPage==='users'" class="space-y-4">
            <div class="panel p-4"><div class="grid gap-3 md:grid-cols-4">
              <label><span class="label">Email</span><input v-model.trim="userForm.Email" :class="fieldClass('Email')" placeholder="name@example.com"><span v-if="fieldError('Email')" class="error-text">{{ fieldError('Email') }}</span></label>
              <label><span class="label">Username</span><input v-model.trim="userForm.Username" :class="fieldClass('Username')"><span v-if="fieldError('Username')" class="error-text">{{ fieldError('Username') }}</span></label>
              <label><span class="label">Role</span><select v-model="userForm.Role" :class="fieldClass('Role')"><option>Admin</option><option>Manager</option><option>Sales</option></select></label>
              <div class="flex items-end gap-2"><button class="btn btn-primary" @click="saveUser"><i class="fa-solid fa-user-plus"></i>Save</button><button class="btn btn-secondary" @click="resetUserForm"><i class="fa-solid fa-eraser"></i>Clear</button></div>
              <label><span class="label">Full Name</span><input v-model="userForm.FullName" class="field"></label>
              <label><span class="label">Department</span><input v-model="userForm.Department" class="field"></label>
              <label><span class="label">Password</span><input v-model="userForm.Password" :class="fieldClass('Password')" type="password" :placeholder="userForm.id?'Leave blank to keep':'Required'"><span v-if="fieldError('Password')" class="error-text">{{ fieldError('Password') }}</span></label>
              <div class="flex flex-col justify-end gap-2 text-sm"><label class="flex items-center gap-2"><input v-model="userForm.IsActive" type="checkbox"> Active</label><label class="flex items-center gap-2"><input v-model="userForm.MustChangePassword" type="checkbox"> Must change password</label></div>
            </div></div>
            <div class="panel"><div class="border-b border-slate-200 p-4"><h2 class="text-sm font-black">Users</h2></div><div class="table-wrap"><table>
              <thead><tr><th>Email</th><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th>Last Login</th><th></th></tr></thead>
              <tbody>
                <tr v-for="p in users" :key="p.Email">
                  <td>{{ p.Email }}</td><td>{{ p.Username }}</td><td>{{ p.FullName }}</td><td>{{ p.Role }}</td><td>{{ p.IsActive?'Yes':'No' }}</td><td>{{ p.LastLoginAt }}</td>
                  <td class="text-right"><button class="icon-btn" @click="editUser(p)"><i class="fa-solid fa-pen"></i></button><button class="icon-btn text-red-600" @click="doDeactivateUser(p.Email)"><i class="fa-solid fa-user-slash"></i></button></td>
                </tr>
                <tr v-if="!users.length"><td colspan="7" class="text-center text-slate-500">No records</td></tr>
              </tbody>
            </table></div></div>
          </section>

          <!-- SETTINGS -->
          <section v-if="currentPage==='settings'" class="space-y-4">
            <button class="btn btn-primary" @click="loadSettings"><i class="fa-solid fa-rotate-right"></i>Load Settings</button>
            <div class="panel"><div class="table-wrap"><table>
              <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
              <tbody><tr v-for="(val,key) in settingsRows" :key="key"><td class="font-bold">{{ key }}</td><td><input v-model="settingsRows[key]" class="field"></td><td class="text-right"><button class="btn btn-secondary" @click="doSaveSetting(key)">Save</button></td></tr></tbody>
            </table></div></div>
          </section>

          <!-- AUDIT -->
          <section v-if="currentPage==='audit'" class="space-y-4">
            <div class="panel p-4"><div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><input v-model="auditFilters.query" class="field" type="search" @keyup.enter="loadAudit"><button class="btn btn-primary" @click="loadAudit">Search</button></div></div>
            <record-list title="Audit Logs" :rows="audit.items" :fields="['Timestamp','UserEmail','Action','EntityType','EntityID']"></record-list>
          </section>
        </section>
      </main>

      <div v-if="toast" :class="['toast border p-4 text-sm',toast.type==='error'?'border-red-200 bg-red-50 text-red-800':'border-green-200 bg-green-50 text-green-800']">
        <div class="font-black">{{ toast.title }}</div><div>{{ toast.message }}</div>
      </div>
    </section>
  </div>
</template>

<script>
import { supabase } from './supabase.js'
import * as api from './api.js'

const RecordList = {
  props: ['title', 'rows', 'fields'],
  template: `<div class="panel"><div class="border-b border-slate-200 p-4"><h2 class="text-sm font-black">{{ title }}</h2></div><div class="table-wrap"><table>
    <thead><tr><th v-for="f in fields" :key="f">{{ f }}</th></tr></thead>
    <tbody><tr v-for="(row,i) in rows" :key="i"><td v-for="f in fields" :key="f">{{ fmt(row[f]) }}</td></tr>
    <tr v-if="!rows||!rows.length"><td :colspan="fields&&fields.length?fields.length:1" class="text-center text-slate-500">No records</td></tr></tbody>
  </table></div></div>`,
  methods: {
    fmt(v) {
      if (v === null || v === undefined) return ''
      if (typeof v === 'number') return new Intl.NumberFormat('th-TH').format(v)
      if (typeof v === 'boolean') return v ? 'Yes' : 'No'
      return String(v)
    },
  },
}

export default {
  name: 'MatchpointCRM',
  components: { RecordList },

  data() {
    return {
      loading: false,
      authChecked: false,
      mobileMenuOpen: false,
      loginForm: { username: '', password: '' },
      loginError: '',
      auth: {}, settings: {}, permissions: {}, schemas: {},
      lookups: { users: [], pipelineStages: [] },
      currentPage: 'dashboard',
      activeEntity: 'customers',
      entityRows: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
      entityFilters: { query: '', page: 1, pageSize: 25 },
      recordForm: {}, fieldErrors: {},
      dashboardFilters: { stage: '', ownerUserId: '' },
      dashboard: { kpis: {}, pipelineByStage: {}, valueByStage: {}, collectionByMonth: {}, topOpportunities: [], overdueInvoices: [] },
      charts: {},
      reportType: 'pipeline', reportFilters: { query: '' }, report: { headers: [], rows: [] },
      users: [], userForm: this.emptyUser(),
      settingsRows: {}, auditFilters: { query: '' }, audit: { items: [] },
      toast: null,
    }
  },

  computed: {
    navItems() {
      const entityItems = Object.keys(this.schemas).map(n => ({
        page: 'entity:' + n,
        label: this.schemas[n].label,
        icon: this.entityIcon(n),
      }))
      const items = [{ page: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' }, ...entityItems, { page: 'reports', label: 'Reports', icon: 'fa-file-lines' }]
      if (this.permissions.canManageSettings) items.push({ page: 'settings', label: 'Settings', icon: 'fa-gear' })
      if (this.permissions.canManageUsers)    items.push({ page: 'users',    label: 'Users',    icon: 'fa-users-gear' })
      if (this.permissions.canViewAuditLogs)  items.push({ page: 'audit',    label: 'Audit Logs', icon: 'fa-shield-halved' })
      return items
    },
    activeSchema() {
      return this.schemas[this.activeEntity] || { label: '', fields: [], key: 'id', required: [], numeric: [], booleans: [], enums: {} }
    },
    pageTitle() {
      if (this.currentPage === 'entity' || this.currentPage === 'form') return this.activeSchema.label
      const i = this.navItems.find(n => n.page === this.currentPage)
      return i ? i.label : 'MATCHPOINT CRM'
    },
    tableFields()    { return (this.activeSchema.fields || []).slice(0, 7) },
    editableFields() { return (this.activeSchema.fields || []) },
    dashboardCards() {
      const k = this.dashboard.kpis || {}
      return [
        { label: 'Customers',    value: this.fmtNum(k.customers) },
        { label: 'Opportunities', value: this.fmtNum(k.opportunities) },
        { label: 'Pipeline',     value: this.fmtMoney(k.totalPipelineValue) },
        { label: 'Weighted',     value: this.fmtMoney(k.weightedPipelineValue) },
        { label: 'Outstanding',  value: this.fmtMoney(k.outstandingAmount) },
        { label: 'Overdue Inv.', value: this.fmtNum(k.overdueInvoices) },
      ]
    },
  },

  async mounted() {
    // Restore session if Supabase already has one in localStorage
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await this.init().catch(() => { this.authChecked = false })
    }
    // Listen for auth changes (logout from another tab, token expiry, etc.)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        this.authChecked = false
        this.auth = {}
      }
      if (event === 'TOKEN_REFRESHED' && session && !this.authChecked) {
        await this.init().catch(() => { this.authChecked = false })
      }
    })
  },

  methods: {
    emptyUser() {
      return { Email: '', Username: '', FullName: '', Role: 'Sales', Department: '', Password: '', IsActive: true, MustChangePassword: true }
    },

    // ---- Auth ----
    async doLogin() {
      this.loginError = ''
      this.loading = true
      try {
        await api.login(this.loginForm.username, this.loginForm.password)
        await this.init()
        this.loginForm.password = ''
      } catch (e) {
        this.loginError = (e && e.message) ? e.message : 'Sign-in failed.'
      } finally {
        this.loading = false
      }
    },

    async init() {
      const d = await api.getBootstrap()
      this.auth        = d.user        || {}
      this.settings    = d.settings    || {}
      this.permissions = d.permissions || {}
      this.schemas     = d.schemas     || {}
      this.lookups     = d.lookups     || {}
      this.authChecked = true
      await this.loadDashboard()
    },

    async doLogout() {
      try { await api.logout() } catch (_) {}
      this.authChecked = false
      this.auth        = {}
      this.loginForm.password = ''
    },

    // ---- Navigation ----
    async navigate(page) {
      this.mobileMenuOpen = false
      this.fieldErrors    = {}
      if (page.startsWith('entity:')) {
        this.activeEntity = page.split(':')[1]
        this.currentPage  = 'entity'
        await this.loadEntity(1)
        return
      }
      this.currentPage = page
      await this.refreshCurrent()
    },

    async refreshCurrent() {
      if (this.currentPage === 'dashboard') return this.loadDashboard()
      if (this.currentPage === 'entity')    return this.loadEntity(this.entityRows.page || 1)
      if (this.currentPage === 'reports')   return this.loadReport()
      if (this.currentPage === 'users')     return this.loadUsers()
      if (this.currentPage === 'settings')  return this.loadSettings()
      if (this.currentPage === 'audit')     return this.loadAudit()
    },

    // ---- Dashboard ----
    async loadDashboard() {
      this.loading = true
      try {
        this.dashboard = await api.getDashboard(this.dashboardFilters)
        this.$nextTick(() => this.renderCharts())
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },
    resetDashboard() { this.dashboardFilters = { stage: '', ownerUserId: '' }; this.loadDashboard() },

    // ---- Entity list ----
    async loadEntity(page) {
      this.entityFilters.page = page || 1
      this.loading = true
      try {
        this.entityRows = await api.listEntity(this.activeEntity, this.entityFilters)
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    newRecord() {
      this.recordForm = {}
      this.editableFields.forEach(f => {
        if (f === 'OwnerUserID' || f === 'AssignedToUserID') this.recordForm[f] = this.auth.userId
        else if (this.fieldType(f) === 'checkbox') this.recordForm[f] = false
      })
      this.fieldErrors = {}
      this.currentPage = 'form'
    },

    async editRecord(id) {
      this.fieldErrors = {}
      this.loading = true
      try {
        this.recordForm  = await api.getEntityRecord(this.activeEntity, id)
        this.currentPage = 'form'
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    async saveRecord() {
      this.fieldErrors = {}
      this.loading = true
      try {
        await api.saveEntityRecord(this.activeEntity, this.recordForm)
        this.showToast('success', 'Saved', 'Record saved.')
        this.currentPage = 'entity'
        await this.loadEntity(this.entityRows.page || 1)
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    async removeRecord(id) {
      if (!confirm('Delete this record?')) return
      this.loading = true
      try {
        await api.deleteEntityRecord(this.activeEntity, id)
        this.showToast('success', 'Deleted', 'Record deleted.')
        await this.loadEntity(this.entityRows.page || 1)
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    // ---- Reports ----
    async loadReport() {
      this.loading = true
      try {
        this.report = await api.getReport(this.reportType, this.reportFilters)
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    exportCsv() {
      const h = this.report.headers || [], rows = this.report.rows || []
      const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
      const csv = [h.join(',')].concat(rows.map(r => h.map(f => esc(r[f])).join(','))).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'MATCHPOINT_' + this.reportType + '_' + Date.now() + '.csv'
      a.click()
      URL.revokeObjectURL(a.href)
      this.showToast('success', 'Export', 'CSV downloaded.')
    },

    // ---- Users ----
    async loadUsers() {
      this.loading = true
      try { this.users = await api.getUsers() } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    editUser(p) { this.fieldErrors = {}; this.userForm = Object.assign({}, p, { Password: '', IsActive: !!p.IsActive, MustChangePassword: !!p.MustChangePassword }) },
    resetUserForm() { this.fieldErrors = {}; this.userForm = this.emptyUser() },

    async saveUser() {
      this.fieldErrors = {}
      this.loading = true
      try {
        await api.saveUser(this.userForm)
        this.resetUserForm()
        await this.loadUsers()
        this.showToast('success', 'Saved', 'User saved.')
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    async doDeactivateUser(email) {
      if (!confirm('Deactivate this user?')) return
      this.loading = true
      try {
        await api.deactivateUser(email)
        await this.loadUsers()
        this.showToast('success', 'Updated', 'User deactivated.')
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    // ---- Settings ----
    async loadSettings() {
      this.loading = true
      try { this.settingsRows = await api.getSettings() } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    async doSaveSetting(key) {
      this.loading = true
      try {
        await api.saveSetting(key, this.settingsRows[key])
        this.showToast('success', 'Saved', 'Setting saved.')
      } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    // ---- Audit ----
    async loadAudit() {
      this.loading = true
      try { this.audit = await api.getAuditLogs(this.auditFilters) } catch (e) { this.handleError(e) } finally { this.loading = false }
    },

    // ---- Field helpers ----
    fieldType(f) {
      if ((this.activeSchema.booleans || []).includes(f)) return 'checkbox'
      if ((this.activeSchema.numeric  || []).includes(f)) return 'number'
      if (/Date$/.test(f)) return 'date'
      if (/Notes|Description|Terms|Address/.test(f)) return 'textarea'
      return 'text'
    },
    fieldOptions(f) {
      const enums = this.activeSchema.enums || {}
      if (enums[f]) {
        return enums[f].map(v => {
          if (f === 'Stage') {
            const s = (this.lookups.pipelineStages || []).find(x => x.StageCode === v)
            return { value: v, label: s ? s.StageName : v }
          }
          return { value: v, label: v }
        })
      }
      if (/UserID$/.test(f)) return (this.lookups.users || []).map(u => ({ value: u.UserID, label: u.FullName || u.Email }))
      return []
    },
    isRequired(f)  { return (this.activeSchema.required || []).includes(f) },
    fieldError(f)  { return this.fieldErrors[f] || '' },
    fieldClass(f)  { return ['field', this.fieldErrors[f] ? 'field-error' : ''] },
    displayValue(v) {
      if (typeof v === 'number')  return this.fmtNum(v)
      if (typeof v === 'boolean') return v ? 'Yes' : 'No'
      return v == null ? '' : String(v)
    },

    // ---- Formatters ----
    fmtNum(v)   { return new Intl.NumberFormat('th-TH').format(Number(v || 0)) },
    fmtMoney(v) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(v || 0)) },

    // ---- Charts ----
    chartData(o) {
      const labels = Object.keys(o || {})
      return {
        labels: labels.length ? labels : ['No data'],
        values: labels.length ? labels.map(l => Number(o[l] || 0)) : [0],
      }
    },
    renderCharts() {
      this.renderChart('pipelineChart',   'bar',  this.dashboard.pipelineByStage   || {}, 'Count')
      this.renderChart('valueChart',      'bar',  this.dashboard.valueByStage      || {}, 'Value')
      this.renderChart('collectionChart', 'line', this.dashboard.collectionByMonth || {}, 'Collected')
    },
    renderChart(id, type, source, label) {
      const el = document.getElementById(id)
      if (!el || !window.Chart) return
      if (this.charts[id]) this.charts[id].destroy()
      const d = this.chartData(source)
      this.charts[id] = new Chart(el, {
        type,
        data: { labels: d.labels, datasets: [{ label, data: d.values, backgroundColor: '#2563eb', borderColor: '#2563eb', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      })
    },

    // ---- Misc ----
    entityIcon(n) {
      return ({ customers: 'fa-building', contacts: 'fa-address-book', opportunities: 'fa-bullseye', activities: 'fa-list-check', products: 'fa-boxes-stacked', quotations: 'fa-file-signature', invoices: 'fa-file-invoice-dollar', payments: 'fa-money-bill-wave' })[n] || 'fa-table'
    },

    handleError(e) {
      this.fieldErrors = {}
      if (e && e.errors) e.errors.forEach(i => { this.fieldErrors[i.field] = i.message })
      this.showToast('error', (e && e.code) ? e.code : 'Error', (e && e.message) ? e.message : 'Something went wrong.')
    },

    showToast(type, title, message) {
      this.toast = { type, title, message }
      window.setTimeout(() => { this.toast = null }, 4000)
    },
  },
}
</script>

<style>
:root { --navy:#0f172a; --line:#e2e8f0; --muted:#64748b; --blue:#2563eb; }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; background:#f8fafc; color:#0f172a; font-family:"Noto Sans Thai",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
button,input,select,textarea { font:inherit; }
.app-shell { min-height:100vh; display:grid; grid-template-columns:264px minmax(0,1fr); }
.sidebar { background:var(--navy); color:#e2e8f0; min-height:100vh; position:sticky; top:0; }
.nav-button { display:flex; align-items:center; gap:.75rem; width:100%; min-height:40px; padding:.625rem .75rem; color:#cbd5e1; border-radius:8px; transition:background .15s,color .15s; }
.nav-button:hover,.nav-button.active { background:#1e293b; color:#fff; }
.panel { background:#fff; border:1px solid var(--line); border-radius:8px; }
.btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; min-height:38px; padding:.5rem .875rem; border-radius:8px; border:1px solid transparent; font-weight:600; cursor:pointer; transition:background .15s,color .15s,border-color .15s; }
.btn-primary { background:var(--blue); color:#fff; } .btn-primary:hover { background:#1d4ed8; }
.btn-secondary { background:#fff; color:#0f172a; border-color:var(--line); } .btn-secondary:hover { background:#f1f5f9; }
.btn:disabled { opacity:.55; cursor:not-allowed; }
.icon-btn { width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid var(--line); background:#fff; color:#334155; cursor:pointer; }
.icon-btn:hover { background:#f1f5f9; }
.field { width:100%; min-height:38px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; padding:.5rem .75rem; outline:none; }
.field:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(37,99,235,.12); }
.field-error { border-color:#dc2626; }
.label { display:block; margin-bottom:.375rem; color:#334155; font-size:.8125rem; font-weight:700; }
.error-text { margin-top:.25rem; color:#dc2626; font-size:.8125rem; }
.status-pill { display:inline-flex; align-items:center; min-height:24px; padding:.125rem .5rem; border-radius:999px; font-size:.75rem; font-weight:700; white-space:nowrap; }
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:separate; border-spacing:0; }
th { background:#f8fafc; color:#475569; font-size:.75rem; font-weight:800; text-align:left; text-transform:uppercase; }
th,td { padding:.75rem; border-bottom:1px solid var(--line); vertical-align:middle; white-space:nowrap; }
tr:last-child td { border-bottom:0; }
.chart-box { position:relative; min-height:280px; }
.toast { position:fixed; top:1rem; right:1rem; z-index:60; max-width:min(420px,calc(100vw - 2rem)); border-radius:8px; box-shadow:0 18px 45px rgba(15,23,42,.18); }
.spinner { width:1.25rem; height:1.25rem; border:3px solid #bfdbfe; border-top-color:#2563eb; border-radius:999px; animation:spin .8s linear infinite; display:inline-block; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:900px) {
  .app-shell { display:block; }
  .sidebar { position:fixed; inset:0 auto 0 0; width:min(82vw,300px); z-index:50; transform:translateX(-100%); transition:transform .18s ease; }
  .sidebar.open { transform:translateX(0); }
  .mobile-scrim { position:fixed; inset:0; z-index:40; background:rgba(15,23,42,.45); }
}
</style>
