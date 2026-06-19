// Minimal QuickBooks Web Connector (QBWC) SOAP server.
// Implements the standard QBWebConnectorSvc interface so QB Desktop's
// Web Connector can pair with this app and exchange qbXML.

const crypto = require('crypto')

const NS = 'http://developer.intuit.com/'

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]))
}

function decodeXml(s) {
  if (s == null) return s
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function getTag(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`)
  const m = xml.match(re)
  return m ? m[1] : null
}

function getAllBlocks(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'g')
  const blocks = []
  let m
  while ((m = re.exec(xml))) blocks.push(m[1])
  return blocks
}

function field(block, tag) {
  const v = getTag(block, tag)
  return v == null ? '' : decodeXml(v).trim()
}

let reqCounter = 0
function nextRequestId() {
  reqCounter += 1
  return String(reqCounter)
}

// One query per "step". Items are split across QuickBooks' three item
// list types since qbXML has no single generic "Item" query.
const ENTITY_STEPS = [
  {
    type: 'customers', reqTag: 'CustomerQueryRq', retTag: 'CustomerRet',
    build: () => `<CustomerQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></CustomerQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'CustomerRet').map((b) => ({
      qbId: field(b, 'ListID'),
      name: field(b, 'Name'),
      company: field(b, 'CompanyName'),
      email: field(b, 'Email'),
      phone: field(b, 'Phone'),
      altPhone: field(b, 'AltPhone'),
      fax: field(b, 'Fax'),
      addr: { line1: field(b, 'Addr1'), city: field(b, 'City') },
      balance: parseFloat(field(b, 'Balance')) || 0,
      notes: field(b, 'Notes'),
      isActive: field(b, 'IsActive') !== 'false',
    })),
  },
  {
    type: 'vendors', reqTag: 'VendorQueryRq', retTag: 'VendorRet',
    build: () => `<VendorQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></VendorQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'VendorRet').map((b) => ({
      qbId: field(b, 'ListID'),
      name: field(b, 'Name'),
      company: field(b, 'CompanyName'),
      email: field(b, 'Email'),
      phone: field(b, 'Phone'),
      balance: parseFloat(field(b, 'Balance')) || 0,
      notes: field(b, 'Notes'),
    })),
  },
  {
    type: 'items', reqTag: 'ItemInventoryQueryRq', retTag: 'ItemInventoryRet',
    build: () => `<ItemInventoryQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></ItemInventoryQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'ItemInventoryRet').map((b) => ({
      qbId: field(b, 'ListID'),
      sku: field(b, 'Name'),
      name: field(b, 'Name'),
      desc: field(b, 'SalesDesc') || field(b, 'PurchaseDesc'),
      price: parseFloat(field(b, 'SalesPrice')) || 0,
      cost: parseFloat(field(b, 'PurchaseCost')) || 0,
      qty: parseFloat(field(b, 'QuantityOnHand')) || 0,
      reorderPt: parseFloat(field(b, 'ReorderPoint')) || 0,
      type: 'inventory',
    })),
  },
  {
    type: 'items', reqTag: 'ItemNonInventoryQueryRq', retTag: 'ItemNonInventoryRet',
    build: () => `<ItemNonInventoryQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></ItemNonInventoryQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'ItemNonInventoryRet').map((b) => ({
      qbId: field(b, 'ListID'),
      sku: field(b, 'Name'),
      name: field(b, 'Name'),
      desc: field(b, 'SalesDesc') || field(b, 'PurchaseDesc'),
      price: parseFloat(field(b, 'SalesPrice')) || 0,
      cost: parseFloat(field(b, 'PurchaseCost')) || 0,
      qty: 0,
      reorderPt: 0,
      type: 'non-inventory',
    })),
  },
  {
    type: 'items', reqTag: 'ItemServiceQueryRq', retTag: 'ItemServiceRet',
    build: () => `<ItemServiceQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></ItemServiceQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'ItemServiceRet').map((b) => ({
      qbId: field(b, 'ListID'),
      sku: field(b, 'Name'),
      name: field(b, 'Name'),
      desc: field(b, 'SalesDesc') || field(b, 'PurchaseDesc'),
      price: parseFloat(field(b, 'SalesPrice')) || 0,
      cost: parseFloat(field(b, 'PurchaseCost')) || 0,
      qty: 0,
      reorderPt: 0,
      type: 'service',
    })),
  },
  {
    type: 'invoices', reqTag: 'InvoiceQueryRq', retTag: 'InvoiceRet',
    build: () => `<InvoiceQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned><IncludeLineItems>true</IncludeLineItems></InvoiceQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'InvoiceRet').map((b) => {
      const balance = parseFloat(field(b, 'BalanceRemaining')) || 0
      const lines = getAllBlocks(b, 'InvoiceLineRet').map((l) => ({
        item: field(l, 'FullName'), desc: field(l, 'Desc'),
        qty: parseFloat(field(l, 'Quantity')) || 0, amount: parseFloat(field(l, 'Amount')) || 0,
      }))
      const total = lines.reduce((s, l) => s + l.amount, 0) || balance
      return {
        qbId: field(b, 'TxnID'),
        invoiceNum: field(b, 'RefNumber'),
        date: field(b, 'TxnDate'),
        due: field(b, 'DueDate'),
        customer: field(b, 'CustomerFullName') || field(b, 'CustomerListID'),
        total,
        paid: total - balance,
        status: balance <= 0 ? 'paid' : 'open',
        lines,
      }
    }),
  },
  {
    type: 'salesOrders', reqTag: 'SalesOrderQueryRq', retTag: 'SalesOrderRet',
    build: () => `<SalesOrderQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned><IncludeLineItems>true</IncludeLineItems></SalesOrderQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'SalesOrderRet').map((b) => {
      const lines = getAllBlocks(b, 'SalesOrderLineRet').map((l) => ({
        item: field(l, 'FullName'), desc: field(l, 'Desc'),
        qty: parseFloat(field(l, 'Quantity')) || 0, amount: parseFloat(field(l, 'Amount')) || 0,
      }))
      return {
        qbId: field(b, 'TxnID'),
        soNum: field(b, 'RefNumber'),
        date: field(b, 'TxnDate'),
        customer: field(b, 'CustomerFullName') || field(b, 'CustomerListID'),
        total: lines.reduce((s, l) => s + l.amount, 0),
        status: field(b, 'IsManuallyClosed') === 'true' ? 'closed' : 'open',
        lines,
      }
    }),
  },
  {
    type: 'purchaseOrders', reqTag: 'PurchaseOrderQueryRq', retTag: 'PurchaseOrderRet',
    build: () => `<PurchaseOrderQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned><IncludeLineItems>true</IncludeLineItems></PurchaseOrderQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'PurchaseOrderRet').map((b) => {
      const lines = getAllBlocks(b, 'PurchaseOrderLineRet').map((l) => ({
        item: field(l, 'FullName'), desc: field(l, 'Desc'),
        qty: parseFloat(field(l, 'Quantity')) || 0,
        cost: parseFloat(field(l, 'Rate')) || 0,
        amount: parseFloat(field(l, 'Amount')) || 0,
      }))
      return {
        qbId: field(b, 'TxnID'),
        poNum: field(b, 'RefNumber'),
        vendor: field(b, 'VendorFullName') || field(b, 'VendorListID'),
        date: field(b, 'TxnDate'),
        total: lines.reduce((s, l) => s + l.amount, 0),
        status: field(b, 'IsFullyReceived') === 'true' ? 'received' : 'open',
        lines,
      }
    }),
  },
  {
    type: 'payments', reqTag: 'ReceivePaymentQueryRq', retTag: 'ReceivePaymentRet',
    build: () => `<ReceivePaymentQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></ReceivePaymentQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'ReceivePaymentRet').map((b) => ({
      qbId: field(b, 'TxnID'),
      customer: field(b, 'CustomerFullName'),
      amount: parseFloat(field(b, 'TotalAmount')) || 0,
      date: field(b, 'TxnDate'),
    })),
  },
  {
    type: 'bills', reqTag: 'BillQueryRq', retTag: 'BillRet',
    build: () => `<BillQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned><IncludeLineItems>true</IncludeLineItems></BillQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'BillRet').map((b) => {
      const lines = getAllBlocks(b, 'ItemLineRet').map((l) => ({
        item: field(l, 'FullName'), desc: field(l, 'Desc'),
        qty: parseFloat(field(l, 'Quantity')) || 0,
        cost: parseFloat(field(l, 'Cost')) || 0,
        amount: parseFloat(field(l, 'Amount')) || 0,
      }))
      return {
        qbId: field(b, 'TxnID'),
        refNum: field(b, 'RefNumber'),
        vendor: field(b, 'VendorFullName') || field(b, 'VendorListID'),
        date: field(b, 'TxnDate'),
        due: field(b, 'DueDate'),
        total: parseFloat(field(b, 'AmountDue')) || lines.reduce((s, l) => s + l.amount, 0),
        isPaid: field(b, 'IsPaid') === 'true',
        lines,
      }
    }),
  },
  {
    type: 'accounts', reqTag: 'AccountQueryRq', retTag: 'AccountRet',
    build: () => `<AccountQueryRq requestID="${nextRequestId()}"><MaxReturned>1000</MaxReturned></AccountQueryRq>`,
    parse: (xml) => getAllBlocks(xml, 'AccountRet').map((b) => ({
      qbId: field(b, 'ListID'),
      number: field(b, 'AccountNumber'),
      name: field(b, 'Name'),
      type: field(b, 'AccountType'),
      balance: parseFloat(field(b, 'Balance')) || 0,
      desc: field(b, 'Desc'),
    })),
  },
]

function buildQbXmlRequest(innerRq) {
  return `<?xml version="1.0" encoding="utf-8"?><?qbxml version="13.0"?><QBXML><QBXMLMsgsRq onError="continueOnError">${innerRq}</QBXMLMsgsRq></QBXML>`
}

function soapEnvelope(bodyXml) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${bodyXml}</soap:Body></soap:Envelope>`
}

function stringResult(method, value) {
  return soapEnvelope(`<${method}Response xmlns="${NS}"><${method}Result>${escapeXml(value)}</${method}Result></${method}Response>`)
}

function intResult(method, value) {
  return soapEnvelope(`<${method}Response xmlns="${NS}"><${method}Result>${value}</${method}Result></${method}Response>`)
}

function arrayResult(method, values) {
  const items = values.map((v) => `<string>${escapeXml(v)}</string>`).join('')
  return soapEnvelope(`<${method}Response xmlns="${NS}"><${method}Result>${items}</${method}Result></${method}Response>`)
}

const WSDL = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="${NS}" xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="${NS}">
  <wsdl:types>
    <xsd:schema targetNamespace="${NS}">
      <xsd:complexType name="ArrayOfString"><xsd:sequence><xsd:element name="string" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/></xsd:sequence></xsd:complexType>
      <xsd:element name="serverVersion"><xsd:complexType/></xsd:element>
      <xsd:element name="serverVersionResponse"><xsd:complexType><xsd:sequence><xsd:element name="serverVersionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="clientVersion"><xsd:complexType><xsd:sequence><xsd:element name="strVersion" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="clientVersionResponse"><xsd:complexType><xsd:sequence><xsd:element name="clientVersionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="authenticate"><xsd:complexType><xsd:sequence><xsd:element name="strUserName" type="xsd:string"/><xsd:element name="strPassword" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="authenticateResponse"><xsd:complexType><xsd:sequence><xsd:element name="authenticateResult" type="tns:ArrayOfString"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="sendRequestXML"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="strHCPResponse" type="xsd:string"/><xsd:element name="strCompanyFileName" type="xsd:string"/><xsd:element name="qbXMLCountry" type="xsd:string"/><xsd:element name="qbXMLMajorVers" type="xsd:int"/><xsd:element name="qbXMLMinorVers" type="xsd:int"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="sendRequestXMLResponse"><xsd:complexType><xsd:sequence><xsd:element name="sendRequestXMLResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="receiveResponseXML"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="response" type="xsd:string"/><xsd:element name="hresult" type="xsd:string"/><xsd:element name="message" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="receiveResponseXMLResponse"><xsd:complexType><xsd:sequence><xsd:element name="receiveResponseXMLResult" type="xsd:int"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="connectionError"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="hresult" type="xsd:string"/><xsd:element name="message" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="connectionErrorResponse"><xsd:complexType><xsd:sequence><xsd:element name="connectionErrorResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getLastError"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getLastErrorResponse"><xsd:complexType><xsd:sequence><xsd:element name="getLastErrorResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="closeConnection"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="closeConnectionResponse"><xsd:complexType><xsd:sequence><xsd:element name="closeConnectionResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getInteractiveURL"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getInteractiveURLResponse"><xsd:complexType><xsd:sequence><xsd:element name="getInteractiveURLResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getInteractiveURLDone"><xsd:complexType><xsd:sequence><xsd:element name="ticket" type="xsd:string"/><xsd:element name="response" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="getInteractiveURLDoneResponse"><xsd:complexType><xsd:sequence><xsd:element name="getInteractiveURLDoneResult" type="tns:ArrayOfString"/></xsd:sequence></xsd:complexType></xsd:element>
    </xsd:schema>
  </wsdl:types>
  ${['serverVersion', 'clientVersion', 'authenticate', 'sendRequestXML', 'receiveResponseXML', 'connectionError', 'getLastError', 'closeConnection', 'getInteractiveURL', 'getInteractiveURLDone'].map((m) => `
  <wsdl:message name="${m}SoapIn"><wsdl:part name="parameters" element="tns:${m}"/></wsdl:message>
  <wsdl:message name="${m}SoapOut"><wsdl:part name="parameters" element="tns:${m}Response"/></wsdl:message>`).join('')}
  <wsdl:portType name="QBWebConnectorSvcSoap">
    ${['serverVersion', 'clientVersion', 'authenticate', 'sendRequestXML', 'receiveResponseXML', 'connectionError', 'getLastError', 'closeConnection', 'getInteractiveURL', 'getInteractiveURLDone'].map((m) => `
    <wsdl:operation name="${m}"><wsdl:input message="tns:${m}SoapIn"/><wsdl:output message="tns:${m}SoapOut"/></wsdl:operation>`).join('')}
  </wsdl:portType>
  <wsdl:binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    ${['serverVersion', 'clientVersion', 'authenticate', 'sendRequestXML', 'receiveResponseXML', 'connectionError', 'getLastError', 'closeConnection', 'getInteractiveURL', 'getInteractiveURLDone'].map((m) => `
    <wsdl:operation name="${m}"><soap:operation soapAction="${NS}${m}"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>`).join('')}
  </wsdl:binding>
  <wsdl:service name="QBWebConnectorSvc">
    <wsdl:port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="__APPURL__"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

function createQbwcSoapHandler({ getSettings, onImportData, onSyncStatus, appUrl }) {
  const sessions = new Map()

  function methodNameFromBody(body) {
    const names = [
      'authenticate', 'sendRequestXML', 'receiveResponseXML', 'closeConnection',
      'getLastError', 'connectionError', 'serverVersion', 'clientVersion',
      'getInteractiveURLDone', 'getInteractiveURL',
    ]
    return names.find((n) => new RegExp(`<(?:\\w+:)?${n}[ >]`).test(body))
  }

  function handleAuthenticate(body) {
    const username = field(body, 'strUserName')
    const password = field(body, 'strPassword')
    const settings = getSettings()
    if (username !== settings.username || password !== settings.password) {
      return arrayResult('authenticate', ['', 'nvu'])
    }
    const ticket = crypto.randomUUID()
    const importOpts = settings.importOpts || {}
    const steps = ENTITY_STEPS.filter((s) => importOpts[s.type] !== false)
    sessions.set(ticket, { steps, index: 0, pending: null, lastError: '' })
    onSyncStatus({ pct: 0, message: 'Connected — starting sync…', step: 0, total: steps.length })
    return arrayResult('authenticate', [ticket, ''])
  }

  function handleSendRequestXML(body) {
    const ticket = field(body, 'ticket')
    const session = sessions.get(ticket)
    if (!session) return stringResult('sendRequestXML', '')
    if (session.index >= session.steps.length) return stringResult('sendRequestXML', '')
    const step = session.steps[session.index]
    session.pending = step
    onSyncStatus({
      pct: Math.floor((session.index / session.steps.length) * 100),
      message: `Requesting ${step.type}…`,
      step: session.index,
      total: session.steps.length,
    })
    return stringResult('sendRequestXML', buildQbXmlRequest(step.build()))
  }

  function handleReceiveResponseXML(body) {
    const ticket = field(body, 'ticket')
    const response = decodeXml(field(body, 'response'))
    const hresult = field(body, 'hresult')
    const message = field(body, 'message')
    const session = sessions.get(ticket)
    if (!session) return intResult('receiveResponseXML', 100)

    const step = session.pending
    if (step) {
      if (hresult) {
        session.lastError = `${step.reqTag}: ${hresult} ${message}`.trim()
      } else {
        try {
          const records = step.parse(response)
          onImportData({ type: step.type, records })
        } catch (e) {
          session.lastError = `${step.reqTag}: failed to parse response (${e.message})`
        }
      }
      session.index += 1
      session.pending = null
    }

    const done = session.index >= session.steps.length
    onSyncStatus({
      pct: done ? 100 : Math.floor((session.index / session.steps.length) * 100),
      message: done ? 'Sync complete' : `Imported ${step ? step.type : ''}`,
      step: session.index,
      total: session.steps.length,
      done,
    })
    return intResult('receiveResponseXML', done ? 100 : Math.floor((session.index / session.steps.length) * 100))
  }

  function handle(body) {
    const method = methodNameFromBody(body)
    switch (method) {
      case 'serverVersion':
        return stringResult('serverVersion', '1.0')
      case 'clientVersion':
        return stringResult('clientVersion', '')
      case 'authenticate':
        return handleAuthenticate(body)
      case 'sendRequestXML':
        return handleSendRequestXML(body)
      case 'receiveResponseXML':
        return handleReceiveResponseXML(body)
      case 'getLastError': {
        const ticket = field(body, 'ticket')
        const session = sessions.get(ticket)
        return stringResult('getLastError', (session && session.lastError) || '')
      }
      case 'closeConnection': {
        const ticket = field(body, 'ticket')
        sessions.delete(ticket)
        return stringResult('closeConnection', 'OK')
      }
      case 'connectionError':
        return stringResult('connectionError', 'done')
      case 'getInteractiveURL':
        return stringResult('getInteractiveURL', '')
      case 'getInteractiveURLDone':
        return arrayResult('getInteractiveURLDone', ['', ''])
      default:
        return null
    }
  }

  function wsdl() {
    return WSDL.replace('__APPURL__', escapeXml(appUrl()))
  }

  return { handle, wsdl }
}

module.exports = { createQbwcSoapHandler, ENTITY_STEPS }
