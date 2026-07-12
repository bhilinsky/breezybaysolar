import type { Item, PurchaseOrder, PurchaseOrderItem, Supplier } from '../types'

// jspdf (+ autotable) is large, so it's dynamically imported here rather
// than at module scope — keeps it out of the main bundle, loaded only when
// a PDF is actually generated.
export async function downloadPurchaseOrderPdf(
  order: PurchaseOrder,
  supplier: Supplier | null,
  lines: PurchaseOrderItem[],
  items: Item[],
  businessName: string | null,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('Purchase Order', 14, 20)
  doc.setFontSize(10)
  doc.text(businessName || 'Your Business', 14, 27)

  doc.setFontSize(11)
  doc.text(`PO #: ${order.po_number}`, 140, 20)
  doc.text(`Date: ${order.created_at.slice(0, 10)}`, 140, 26)
  if (order.expected_date) doc.text(`Expected: ${order.expected_date}`, 140, 32)

  let y = 40
  doc.setFontSize(11)
  doc.text('Vendor:', 14, y)
  doc.setFontSize(10)
  if (supplier) {
    doc.text(supplier.name, 14, y + 6)
    let vy = y + 12
    if (supplier.contact_name) {
      doc.text(supplier.contact_name, 14, vy)
      vy += 6
    }
    if (supplier.address) {
      doc.text(supplier.address, 14, vy)
      vy += 6
    }
    if (supplier.email) {
      doc.text(supplier.email, 14, vy)
      vy += 6
    }
    if (supplier.phone) {
      doc.text(supplier.phone, 14, vy)
      vy += 6
    }
    y = vy + 4
  } else {
    doc.text('No vendor on file', 14, y + 6)
    y += 16
  }

  const rows = lines.map((line) => {
    const item = items.find((i) => i.id === line.item_id)
    const unitCost = line.unit_cost ?? 0
    return [
      item ? `${item.sku} — ${item.name}` : line.item_id,
      String(line.quantity_ordered),
      `$${unitCost.toFixed(2)}`,
      `$${(unitCost * line.quantity_ordered).toFixed(2)}`,
    ]
  })
  const total = lines.reduce((sum, l) => sum + (l.unit_cost ?? 0) * l.quantity_ordered, 0)

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Qty', 'Unit cost', 'Line total']],
    body: rows,
    foot: [['', '', 'Total', `$${total.toFixed(2)}`]],
    theme: 'grid',
    headStyles: { fillColor: [40, 60, 40] },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
  })

  if (order.notes) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    doc.setFontSize(10)
    doc.text('Notes:', 14, finalY + 10)
    doc.text(doc.splitTextToSize(order.notes, 180), 14, finalY + 16)
  }

  doc.save(`${order.po_number}.pdf`)
}
