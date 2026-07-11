export type Role = 'admin' | 'staff'

export type BusinessType = 'retailer' | 'service' | 'contractor' | 'manufacturer' | 'distributor' | 'web_store'

// Suggested default for the onboarding question below — not the source of
// truth for gating; that's business_profile.needs_warehouse, since any
// business type can answer either way.
export const defaultWarehouseBusinessTypes: BusinessType[] = ['retailer', 'manufacturer', 'distributor', 'web_store']

export interface BusinessProfile {
  id: true
  business_type: BusinessType
  business_name: string | null
  needs_warehouse: boolean
  needs_bin_locations: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
}

export interface Category {
  id: string
  name: string
  created_at: string
}

export type LocationType = 'warehouse' | 'safe' | 'display_case' | 'storefront_floor' | 'other'

export interface Location {
  id: string
  code: string
  name: string
  description: string | null
  type: LocationType
  bin_code: string | null
  created_at: string
}

export interface Container {
  id: string
  code: string
  label: string
  location_id: string | null
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  sku: string
  name: string
  description: string | null
  category_id: string | null
  unit: string
  reorder_point: number
  default_cost: number | null
  barcode: string | null
  created_at: string
  updated_at: string
}

export interface InventoryLevel {
  id: string
  item_id: string
  location_id: string
  container_id: string | null
  quantity: number
  updated_at: string
}

export interface Movement {
  id: string
  container_id: string | null
  item_id: string | null
  quantity: number | null
  from_location_id: string | null
  to_location_id: string
  scan_code: string
  moved_by: string | null
  occurred_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string | null
  status: PurchaseOrderStatus
  expected_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  item_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
}

export interface Customer {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
  salesforce_contact_id: string | null
}

export type BroadcastStatus = 'draft' | 'sending' | 'sent' | 'failed'

export interface Broadcast {
  id: string
  subject: string
  body: string
  status: BroadcastStatus
  recipient_count: number | null
  error_message: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
}

export type SalesOrderStatus = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled'

export interface SalesOrder {
  id: string
  order_number: string
  customer_id: string | null
  status: SalesOrderStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  item_id: string
  location_id: string | null
  quantity_ordered: number
  quantity_fulfilled: number
  unit_price: number | null
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

export interface Invoice {
  id: string
  invoice_number: string
  customer_id: string | null
  sales_order_id: string | null
  status: InvoiceStatus
  amount: number
  due_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  paid_at: string | null
}

export type BillStatus = 'draft' | 'received' | 'paid' | 'cancelled'

export interface Bill {
  id: string
  bill_number: string
  supplier_id: string | null
  purchase_order_id: string | null
  status: BillStatus
  amount: number
  due_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  paid_at: string | null
}

export type GLAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'cogs' | 'expense'
export type GLAccountRole = 'cash' | 'ar' | 'ap' | 'sales_revenue' | 'purchases_expense'

export interface GLAccount {
  id: string
  code: string
  name: string
  type: GLAccountType
  normal_balance: 'debit' | 'credit'
  role: GLAccountRole | null
  is_active: boolean
  created_at: string
}

export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  memo: string | null
  reference: string | null
  status: 'posted' | 'void'
  source: string
  source_id: string | null
  created_by: string | null
  created_at: string
}

export interface JournalEntryLine {
  id: string
  journal_entry_id: string
  gl_account_id: string
  debit: number
  credit: number
  memo: string | null
}

export interface LowStockItem {
  id: string
  sku: string
  name: string
  reorder_point: number
  total_quantity: number
}

export interface SalesforceStatus {
  instance_url: string | null
  connected_at: string | null
  last_synced_at: string | null
  connected: boolean
}

export type CRMActivityType = 'call' | 'email' | 'meeting' | 'note'

export interface CRMActivity {
  id: string
  customer_id: string
  type: CRMActivityType
  subject: string
  notes: string | null
  occurred_at: string
  created_by: string | null
  created_at: string
}

export type OpportunityStage = 'prospecting' | 'qualified' | 'proposal' | 'won' | 'lost'

export interface Opportunity {
  id: string
  customer_id: string
  name: string
  stage: OpportunityStage
  value: number | null
  expected_close_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
