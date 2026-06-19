import type { Customer, Item, SalesOrder, SalesOrderItem } from '../types'

// Generic columns matched against ShipRush's CSV import field mapping —
// https://www.shiprush.com supports mapping arbitrary CSV headers on import,
// so there's no fixed schema to match exactly.
const HEADERS = [
  'OrderNumber',
  'ShipToName',
  'ShipToAddress',
  'ShipToPhone',
  'ShipToEmail',
  'Items',
  'TotalWeight',
  'Notes',
]

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function buildShipRushCsv(
  order: SalesOrder,
  customer: Customer | null,
  lines: SalesOrderItem[],
  items: Item[],
) {
  const itemSummary = lines
    .map((line) => {
      const item = items.find((i) => i.id === line.item_id)
      return `${line.quantity_ordered}x ${item?.sku ?? line.item_id}`
    })
    .join('; ')

  const totalWeight = lines.reduce((sum, line) => {
    const item = items.find((i) => i.id === line.item_id)
    return sum + (item?.weight_lbs ?? 0) * line.quantity_ordered
  }, 0)

  const row = [
    order.order_number,
    customer?.name ?? '',
    customer?.address ?? '',
    customer?.phone ?? '',
    customer?.email ?? '',
    itemSummary,
    totalWeight ? totalWeight.toFixed(2) : '',
    order.notes ?? '',
  ]

  return [HEADERS, row].map((cols) => cols.map(csvEscape).join(',')).join('\r\n')
}

export function downloadShipRushCsv(
  order: SalesOrder,
  customer: Customer | null,
  lines: SalesOrderItem[],
  items: Item[],
) {
  const csv = buildShipRushCsv(order, customer, lines, items)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${order.order_number}-shiprush.csv`
  link.click()
  URL.revokeObjectURL(url)
}
