export type Role = 'admin' | 'staff'

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

export interface Location {
  id: string
  code: string
  name: string
  description: string | null
  created_at: string
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
  weight_lbs: number | null
  created_at: string
  updated_at: string
}

export interface InventoryLevel {
  id: string
  item_id: string
  location_id: string
  quantity: number
  updated_at: string
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

export type LeadStatus = 'lead' | 'prospect' | 'customer' | 'inactive'

export interface Customer {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  lead_status: LeadStatus
  follow_up_date: string | null
  created_at: string
}

export interface CustomerNote {
  id: string
  customer_id: string
  note: string
  created_by: string | null
  created_at: string
}

export type ContractorStatus = 'active' | 'inactive'

export interface Contractor {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  trade: string | null
  status: ContractorStatus
  notes: string | null
  created_at: string
}

export type SalesOrderStatus = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled'

export interface SalesOrder {
  id: string
  order_number: string
  customer_id: string | null
  contractor_id: string | null
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

export interface LowStockItem {
  id: string
  sku: string
  name: string
  reorder_point: number
  total_quantity: number
}
