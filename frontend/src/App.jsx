import { startTransition, useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import { Bar, Pie } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import './App.css'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ChartDataLabels,
)

const SHORTAGE_MARKERS = new Set(['⚠️ SHORTAGE', 'âš ï¸ SHORTAGE'])
const HOLD_EXPORT_COLUMNS = [
  'dsn',
  'serial',
  'variant',
  'order_number',
  'description',
  'model',
  'work_content',
  'vehicle_type',
  'region',
  'state',
  'hold_status',
  'vehicle_start_time',
]
const SKIP_EXPORT_COLUMNS = [
  'dsn',
  'serial',
  'variant',
  'order_number',
  'description',
  'model',
  'work_content',
  'vehicle_type',
  'region',
  'status',
  'vehicle_order_state',
  'vehicle_start_time',
]
const HOLD_TABLE_COLUMNS = [
  ['DSN', 'dsn'],
  ['Serial No.', 'serial'],
  ['Variant', 'variant'],
  ['Order Number', 'order_number'],
  ['Description', 'description'],
  ['Model', 'model'],
  ['Work Content', 'work_content'],
  ['Type', 'vehicle_type'],
  ['Region', 'region'],
  ['State', 'vehicle_order_state'],
  ['Hold Status', 'hold_status'],
  ['Vehicle Start Time', 'vehicle_start_time'],
]
const SKIP_TABLE_COLUMNS = [
  ['DSN', 'dsn'],
  ['Serial No.', 'serial'],
  ['Variant', 'variant'],
  ['Order Number', 'order_number'],
  ['Description', 'description'],
  ['Model', 'model'],
  ['Work Content', 'work_content'],
  ['Type', 'vehicle_type'],
  ['Region', 'region'],
  ['Status', 'status'],
  ['State', 'vehicle_order_state'],
  ['Vehicle Start Time', 'vehicle_start_time'],
]
const WITHOUT_WORK_CONTENT = (columns) => columns.filter(([label, field]) => label !== 'Work Content' && field !== 'work_content')
const PIE_HOLD_COLORS = ['#d9485f', '#f08949', '#ef7d95', '#5f50cf', '#15938f', '#3c91e6', '#9aa8bc', '#ffc34d']
const PIE_SKIP_COLORS = ['#ffc145', '#3cb371', '#3c91e6', '#2ec4b6', '#7c4dff', '#ef476f', '#ff8c42', '#9aa8bc']
const REASON_COLUMN = 'Skip/hold reason'
const OUTLOOK_COLUMN = 'Outlook'
const RELEASE_SEQUENCE_COLUMN = 'Release sequence'
const SEQUENCE_COLUMNS = ['Line in sequence', 'Production Date', 'Line in time', RELEASE_SEQUENCE_COLUMN]
const LANDING_IMAGE_URL = 'https://www.bharatbenz.com/uploads/homebanner_images/large/BB-Construction.jpg'
const LINE_TYPES = {
  HDT: {
    title: 'HDT',
    description: 'Heavy-duty truck sequence timing',
    standardMinutes: 1070,
    thursdayMinutes: 1010,
    shiftEndMinute: 26 * 60 + 20,
  },
  MDT: {
    title: 'MDT',
    description: 'Medium-duty truck single-shift timing',
    standardMinutes: 541,
    thursdayMinutes: 481,
    shiftEndMinute: 16 * 60 + 45,
  },
}
const DEFAULT_SCHEDULE_SETTINGS = {
  HDT: {
    numberOfShifts: 2,
    shifts: [
      { label: 'A shift', start: '07:00', end: '16:45' },
      { label: 'B shift', start: '16:45', end: '02:20' },
      { label: 'C shift', start: '02:20', end: '07:00' },
    ],
    breaks: [
      { id: 'morning', label: 'Morning break', type: 'Break', start: '09:30', end: '09:37' },
      { id: 'lunch', label: 'Lunch', type: 'Lunch', start: '11:30', end: '12:00' },
      { id: 'afternoon', label: 'Afternoon break', type: 'Break', start: '14:30', end: '14:37' },
      { id: 'evening', label: 'Evening break', type: 'Break', start: '18:30', end: '18:37' },
      { id: 'dinner', label: 'Dinner', type: 'Lunch', start: '20:30', end: '21:00' },
      { id: 'midnight', label: 'Midnight break', type: 'Break', start: '00:00', end: '00:07' },
      { id: 'thursday-stop', label: 'Thursday planned stop', type: 'Break', start: '08:30', end: '09:30', thursdayOnly: true },
    ],
  },
  MDT: {
    numberOfShifts: 1,
    shifts: [
      { label: 'A shift', start: '07:00', end: '16:45' },
      { label: 'B shift', start: '16:45', end: '02:20' },
      { label: 'C shift', start: '02:20', end: '07:00' },
    ],
    breaks: [
      { id: 'morning', label: 'Morning break', type: 'Break', start: '09:30', end: '09:37' },
      { id: 'lunch', label: 'Lunch', type: 'Lunch', start: '11:30', end: '12:00' },
      { id: 'afternoon', label: 'Afternoon break', type: 'Break', start: '14:30', end: '14:37' },
      { id: 'thursday-stop', label: 'Thursday planned stop', type: 'Break', start: '08:30', end: '09:30', thursdayOnly: true },
    ],
  },
}
const REPORT_TYPES = {
  opening: {
    title: 'Opening Report',
    shortTitle: 'Opening',
    copy: 'Initial shift report used for sequence planning.',
  },
  mod: {
    title: 'MOD Report',
    shortTitle: 'MOD',
    copy: 'Updated mid-shift report for refreshed analytics.',
  },
}
const PLAN_REPORT_TYPE = {
  title: 'Plan & Summary',
  shortTitle: 'Plan',
  copy: 'Current-day plan message generated from the Opening report.',
}
const CRITICAL_PART_REPORT_TYPE = {
  title: 'Critical Part info',
  shortTitle: 'Critical Part info',
  copy: 'Maintain critical part ownership, stock, and outlook details.',
}
const ANALYTICS_VIEW_TYPES = {
  ...REPORT_TYPES,
  plan: PLAN_REPORT_TYPE,
  critical: CRITICAL_PART_REPORT_TYPE,
}
const VAJRA_VARIANTS = new Set([
  'V400842221O000103',
  'V400842221O0Y0103',
  'V400842231O0FK103',
  'V400842231O0WK103',
  'V400854221N000103',
  'V400854221N000203',
  'V400854231N0F5103',
  'V400854231N0F5203',
  'V400854231N0FA103',
])
const PLAN_VARIANT_TARGETS = [
  { label: '40KL', variant: 'V400905220U570C02' },
  { label: '28 ft Balancer', variant: 'V400905220U5T0102' },
  { label: '4828RT', variant: 'V400985220O0A0802' },
]

function getInitialLineType() {
  const lineParam = new URLSearchParams(window.location.search).get('line')?.toUpperCase()
  return LINE_TYPES[lineParam] ? lineParam : 'HDT'
}

function getInitialLandingState() {
  const params = new URLSearchParams(window.location.search)
  return !(params.get('view') === 'app' || params.has('line'))
}

function getLineTabUrl(lineType) {
  const url = new URL(window.location.href)
  url.searchParams.set('line', lineType)
  url.searchParams.set('view', 'app')
  return url.toString()
}

const WORKSPACE_DB_NAME = 'sequence-analyser-workspace'
const WORKSPACE_STORE_NAME = 'workspaces'

function openWorkspaceDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
        db.createObjectStore(WORKSPACE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transactWorkspace(mode, callback) {
  const db = await openWorkspaceDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORKSPACE_STORE_NAME, mode)
    const store = transaction.objectStore(WORKSPACE_STORE_NAME)
    const request = callback(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

function getWorkspaceKey(lineType) {
  return `${lineType}-workspace`
}

function readWorkspace(lineType) {
  return transactWorkspace('readonly', (store) => store.get(getWorkspaceKey(lineType)))
}

function writeWorkspace(lineType, workspace) {
  return transactWorkspace('readwrite', (store) => store.put(workspace, getWorkspaceKey(lineType)))
}

function clearWorkspace(lineType) {
  return transactWorkspace('readwrite', (store) => store.delete(getWorkspaceKey(lineType)))
}

function createDefaultScheduleSettings(lineType = 'HDT') {
  const defaults = DEFAULT_SCHEDULE_SETTINGS[lineType] ?? DEFAULT_SCHEDULE_SETTINGS.HDT
  return structuredClone(defaults)
}

function parseTimeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

function normalizeEndMinute(startMinute, endMinute) {
  if (startMinute === null || endMinute === null) {
    return null
  }
  return endMinute <= startMinute ? endMinute + 24 * 60 : endMinute
}

function getActiveScheduleShifts(lineType, scheduleSettings) {
  const settings = scheduleSettings ?? createDefaultScheduleSettings(lineType)
  const count = Math.min(Math.max(Number.parseInt(settings.numberOfShifts, 10) || 1, 1), 3)

  return (settings.shifts ?? [])
    .slice(0, count)
    .map((shift, index) => {
      const startMinute = parseTimeToMinutes(shift.start)
      const rawEndMinute = parseTimeToMinutes(shift.end)
      const endMinute = normalizeEndMinute(startMinute, rawEndMinute)

      return {
        ...shift,
        label: shift.label || `${String.fromCharCode(65 + index)} shift`,
        startMinute,
        endMinute,
      }
    })
    .filter((shift) => shift.startMinute !== null && shift.endMinute !== null && shift.endMinute > shift.startMinute)
}

function getScheduleProfile(lineType, productionDate, scheduleSettings) {
  const fallbackConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT
  const shifts = getActiveScheduleShifts(lineType, scheduleSettings)
  const startMinute = shifts[0]?.startMinute ?? 7 * 60
  const endMinute = shifts.length ? shifts[shifts.length - 1].endMinute : fallbackConfig.shiftEndMinute
  const breaks = (scheduleSettings?.breaks ?? createDefaultScheduleSettings(lineType).breaks)
    .filter((breakWindow) => !breakWindow.thursdayOnly || productionDate.getDay() === 4)
    .map((breakWindow) => {
      const start = parseTimeToMinutes(breakWindow.start)
      const rawEnd = parseTimeToMinutes(breakWindow.end)
      if (start === null || rawEnd === null) {
        return null
      }
      let normalizedStart = start
      if (normalizedStart < startMinute && endMinute > 24 * 60) {
        normalizedStart += 24 * 60
      }
      let normalizedEnd = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd
      if (normalizedEnd <= startMinute && endMinute > 24 * 60) {
        normalizedEnd += 24 * 60
      }
      if (normalizedEnd <= startMinute || normalizedStart >= endMinute || normalizedEnd <= normalizedStart) {
        return null
      }
      return {
        start: Math.max(normalizedStart, startMinute),
        end: Math.min(normalizedEnd, endMinute),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
  const breakMinutes = breaks.reduce((total, breakWindow) => total + Math.max(0, breakWindow.end - breakWindow.start), 0)
  const totalMinutes = Math.max(1, endMinute - startMinute - breakMinutes)

  return {
    shifts,
    startMinute,
    endMinute,
    breaks,
    totalMinutes,
  }
}

function createReasonBucket() {
  return {
    groupBy: 'model',
    selectedGroup: '',
    groupReasons: {
      model: {},
      variant: {},
    },
    groupOutlooks: {
      model: {},
      variant: {},
    },
    orderReasons: {},
    orderOutlooks: {},
  }
}

function createReasonState() {
  return {
    skip: createReasonBucket(),
    hold: createReasonBucket(),
  }
}

function createCriticalPartRow(patch = {}) {
  return {
    id: `critical-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    partNumber: '',
    partDescription: '',
    vendorName: '',
    supplierBacklog: '',
    pmcName: '',
    l4Name: '',
    smName: '',
    pointOfFit: '',
    referenceOrderNumber: '',
    availableStock: '',
    expectedQty: '',
    expectedEta: '',
    requirementCoverage: [],
    ...patch,
  }
}

function normalizeCriticalPartNumber(value) {
  return String(value ?? '').replaceAll('.', '').trim()
}

function getPartNumberFromFileName(fileName = '') {
  return fileName.replace(/\.[^/.]+$/, '').replaceAll('.', '').trim()
}

function createShortageRow(file = null) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    part: file ? getPartNumberFromFileName(file.name) : '',
    partName: '',
    ref: '',
    qty: '',
    usage: '1',
    file,
  }
}

function normalizeData(rawData) {
  return {
    summary: rawData?.summary ?? {},
    gaps: Array.isArray(rawData?.gaps) ? rawData.gaps : [],
    holdOrders: Array.isArray(rawData?.hold_orders) ? rawData.hold_orders : [],
    skipOrders: Array.isArray(rawData?.skip_orders) ? rawData.skip_orders : [],
    previewColumns: Array.isArray(rawData?.preview_columns) ? rawData.preview_columns : [],
    previewData: Array.isArray(rawData?.preview_data) ? rawData.preview_data : [],
  }
}

function escapeCsvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function buildCsvText(columns, rows) {
  return [
    columns.map(escapeCsvValue).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')),
  ].join('\n')
}

function triggerDownload(fileName, columns, rows) {
  const csv = buildCsvText(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getShortageCount(row) {
  return Object.values(row).filter((value) => SHORTAGE_MARKERS.has(String(value))).length
}

function normalizeLookupValue(value) {
  return String(value ?? '').trim()
}

function normalizeLookupKey(value) {
  return normalizeLookupValue(value).toUpperCase()
}

function normalizePartKey(value) {
  return normalizeLookupValue(value).toUpperCase()
}

function normalizeOrderKey(value) {
  return normalizeLookupValue(value).replace(/\.0$/, '').toUpperCase()
}

function normalizeVehicleKey(value) {
  const text = normalizeLookupValue(value).replace(/\.0$/, '')
  const digits = text.replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(-6) : text.toUpperCase()
}

function getOrderKey(row, fallback = '') {
  return (
    normalizeOrderKey(row?.serial) ||
    normalizeOrderKey(row?.dsn) ||
    normalizeOrderKey(row?.order_number) ||
    normalizeOrderKey(fallback)
  )
}

function getPreviewValue(row, names) {
  for (const name of names) {
    const value = row?.[name]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function getPreviewOrderKey(row) {
  return (
    normalizeOrderKey(getPreviewValue(row, ['Serial Number', 'SERIAL NUMBER', 'Serial', 'serial'])) ||
    normalizeOrderKey(getPreviewValue(row, ['DSN', 'Delivery Sequence Number', 'DELIVERY SEQUENCE NUMBER', 'dsn'])) ||
    normalizeOrderKey(getPreviewValue(row, ['Order Number', 'ORDER NUMBER', 'Order No', 'order_number']))
  )
}

function getPreviewVehicleKey(row) {
  const orderNumber = getPreviewValue(row, ['Order Number', 'ORDER NUMBER', 'Order No', 'order_number'])
  const orderKey = normalizeVehicleKey(orderNumber)
  if (orderKey) {
    return orderKey
  }

  return normalizeVehicleKey(getPreviewValue(row, ['Serial Number', 'SERIAL NUMBER', 'Serial', 'serial'])) ||
    normalizeVehicleKey(getPreviewValue(row, ['DSN', 'Delivery Sequence Number', 'DELIVERY SEQUENCE NUMBER', 'dsn']))
}

function getVehicleKeyCandidates(row) {
  return [
    row?.order_number,
    row?.['Order Number'],
    row?.['ORDER NUMBER'],
    row?.serial,
    row?.['Serial Number'],
    row?.['SERIAL NUMBER'],
    row?.dsn,
    row?.DSN,
    row?.['Delivery Sequence Number'],
  ]
    .map(normalizeVehicleKey)
    .filter(Boolean)
}

function buildVehicleKeySet(rows = []) {
  const keys = new Set()
  for (const row of rows) {
    for (const key of getVehicleKeyCandidates(row)) {
      keys.add(key)
    }
  }
  return keys
}

function getPreviewOrderState(row) {
  return normalizeLookupKey(getPreviewValue(row, ['Vehicle Order State', 'VEHICLE ORDER STATE', 'Vehicle order state', 'State', 'state']))
}

function buildReleasedHoldKeys(openingRows = [], modRows = []) {
  const openingHoldKeys = buildOpeningHoldKeys(openingRows)

  const releasedKeys = new Set()
  for (const row of modRows) {
    const key = getPreviewVehicleKey(row)
    const state = getPreviewOrderState(row)
    if (key && openingHoldKeys.has(key) && state && state !== 'HOLD') {
      releasedKeys.add(key)
    }
  }

  return releasedKeys
}

function buildOpeningHoldKeys(openingRows = []) {
  const openingHoldKeys = new Set()

  for (const row of openingRows) {
    if (getPreviewOrderState(row) === 'HOLD') {
      const key = getPreviewVehicleKey(row)
      if (key) {
        openingHoldKeys.add(key)
      }
    }
  }

  return openingHoldKeys
}

function buildSequenceBaseline(rows = []) {
  const baseline = new Map()

  for (const row of rows) {
    const key = getPreviewVehicleKey(row)
    const lineSequence = row?.['Line in sequence']
    const productionDate = row?.['Production Date']
    const lineTime = row?.['Line in time']

    if (key && lineSequence !== '' && lineSequence !== undefined && productionDate && lineTime && !baseline.has(key)) {
      baseline.set(key, { lineSequence, productionDate, lineTime })
    }
  }

  return baseline
}

function buildReleaseSequenceBaseline(rows = []) {
  const baseline = new Map()

  for (const row of rows) {
    const key = getPreviewVehicleKey(row)
    const releaseSequence = row?.[RELEASE_SEQUENCE_COLUMN]

    if (key && releaseSequence !== '' && releaseSequence !== undefined && releaseSequence !== null && !baseline.has(key)) {
      baseline.set(key, releaseSequence)
    }
  }

  return baseline
}

function getGroupValue(row, groupBy) {
  return normalizeLookupValue(row?.[groupBy]) || 'Unknown'
}

function getAvailableGroups(rows, groupBy) {
  return [...new Set(rows.map((row) => getGroupValue(row, groupBy)))].sort((a, b) => a.localeCompare(b))
}

function getReasonForOrder(row, reasonBucket, fallback = '') {
  const orderKey = getOrderKey(row, fallback)
  const directReason = reasonBucket.orderReasons[orderKey]
  if (directReason !== undefined && directReason !== '') {
    return directReason
  }

  const groupValue = getGroupValue(row, reasonBucket.groupBy)
  return reasonBucket.groupReasons[reasonBucket.groupBy]?.[groupValue] ?? ''
}

function getOutlookForOrder(row, reasonBucket, fallback = '') {
  const orderKey = getOrderKey(row, fallback)
  const directOutlook = reasonBucket.orderOutlooks[orderKey]
  if (directOutlook !== undefined && directOutlook !== '') {
    return directOutlook
  }

  const groupValue = getGroupValue(row, reasonBucket.groupBy)
  return reasonBucket.groupOutlooks[reasonBucket.groupBy]?.[groupValue] ?? ''
}

function getPreviewGroupValue(row, groupBy) {
  const aliases =
    groupBy === 'variant'
      ? ['Variant', 'VARIANT', 'variant']
      : ['Model', 'MODEL', 'model']

  return normalizeLookupValue(getPreviewValue(row, aliases)) || 'Unknown'
}

function getReasonForPreviewRow(row, reasonBucket, orderKey) {
  const directReason = reasonBucket.orderReasons[orderKey]
  if (directReason !== undefined && directReason !== '') {
    return directReason
  }

  const groupValue = getPreviewGroupValue(row, reasonBucket.groupBy)
  return reasonBucket.groupReasons[reasonBucket.groupBy]?.[groupValue] ?? ''
}

function getOutlookForPreviewRow(row, reasonBucket, orderKey) {
  const directOutlook = reasonBucket.orderOutlooks[orderKey]
  if (directOutlook !== undefined && directOutlook !== '') {
    return directOutlook
  }

  const groupValue = getPreviewGroupValue(row, reasonBucket.groupBy)
  return reasonBucket.groupOutlooks[reasonBucket.groupBy]?.[groupValue] ?? ''
}

function formatOutlookValue(value) {
  return value ? String(value).replace('T', ' ') : ''
}

function buildOrderLookup(rows) {
  const lookup = new Map()
  rows.forEach((row, index) => {
    const key = getOrderKey(row, index)
    if (key) {
      lookup.set(key, row)
    }
  })
  return lookup
}

function getPreviewReason(row, reasonConfig, lookups) {
  const key = getPreviewOrderKey(row)
  const state = getPreviewOrderState(row)
  const status = normalizeLookupKey(getPreviewValue(row, ['Status', 'STATUS', 'status']))
  const holdOrder = key ? lookups.hold.get(key) : null
  const skipOrder = key ? lookups.skip.get(key) : null

  if (state === 'HOLD' && holdOrder) {
    return getReasonForOrder(holdOrder, reasonConfig.hold)
  }
  if (state === 'HOLD') {
    return getReasonForPreviewRow(row, reasonConfig.hold, key)
  }
  if (status === 'TRIM LINE' && skipOrder) {
    return getReasonForOrder(skipOrder, reasonConfig.skip)
  }
  if (status === 'TRIM LINE') {
    return getReasonForPreviewRow(row, reasonConfig.skip, key)
  }
  if (holdOrder) {
    return getReasonForOrder(holdOrder, reasonConfig.hold)
  }
  if (skipOrder) {
    return getReasonForOrder(skipOrder, reasonConfig.skip)
  }

  return ''
}

function getPreviewOutlook(row, reasonConfig, lookups) {
  const key = getPreviewOrderKey(row)
  const state = getPreviewOrderState(row)
  const status = normalizeLookupKey(getPreviewValue(row, ['Status', 'STATUS', 'status']))
  const holdOrder = key ? lookups.hold.get(key) : null
  const skipOrder = key ? lookups.skip.get(key) : null

  if (state === 'HOLD' && holdOrder) {
    return getOutlookForOrder(holdOrder, reasonConfig.hold)
  }
  if (state === 'HOLD') {
    return getOutlookForPreviewRow(row, reasonConfig.hold, key)
  }
  if (status === 'TRIM LINE' && skipOrder) {
    return getOutlookForOrder(skipOrder, reasonConfig.skip)
  }
  if (status === 'TRIM LINE') {
    return getOutlookForPreviewRow(row, reasonConfig.skip, key)
  }
  if (holdOrder) {
    return getOutlookForOrder(holdOrder, reasonConfig.hold)
  }
  if (skipOrder) {
    return getOutlookForOrder(skipOrder, reasonConfig.skip)
  }

  return ''
}

function applySkipHoldReasons(sequencedPreview, analysis, reasonConfig, releasedHoldKeys = new Set()) {
  const baseColumns = sequencedPreview.columns.filter((column) => ![REASON_COLUMN, OUTLOOK_COLUMN].includes(column))
  const columns = [...baseColumns]
  const statusIndex = columns.indexOf('Status')
  if (statusIndex === -1) {
    columns.push(REASON_COLUMN)
    columns.push(OUTLOOK_COLUMN)
  } else {
    columns.splice(statusIndex + 1, 0, REASON_COLUMN)
    columns.splice(statusIndex + 2, 0, OUTLOOK_COLUMN)
  }

  if (!analysis) {
    return { ...sequencedPreview, columns }
  }

  const lookups = {
    hold: buildOrderLookup(analysis.holdOrders ?? []),
    skip: buildOrderLookup(analysis.skipOrders ?? []),
  }
  const rows = sequencedPreview.rows.map((row) => {
    const key = getPreviewVehicleKey(row)
    const wasReleasedFromHold = key && releasedHoldKeys.has(key)

    return {
      ...row,
      [REASON_COLUMN]: wasReleasedFromHold ? 'Released' : getPreviewReason(row, reasonConfig, lookups),
      [OUTLOOK_COLUMN]: formatOutlookValue(getPreviewOutlook(row, reasonConfig, lookups)),
    }
  })

  return {
    ...sequencedPreview,
    columns,
    rows,
  }
}

function getNextWorkingDay(date, holidays) {
  const nextDate = new Date(date)

  while (true) {
    const key = formatDateKey(nextDate)
    if (nextDate.getDay() !== 0 && !holidays.includes(key)) {
      return nextDate
    }
    nextDate.setDate(nextDate.getDate() + 1)
  }
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLineTime(date) {
  const hours = date.getHours() % 12 || 12
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const meridiem = date.getHours() >= 12 ? 'PM' : 'AM'
  return `${hours}:${minutes} ${meridiem}`
}

function createShiftTime(productionDate, minutesFromMidnight) {
  const date = new Date(productionDate)
  date.setHours(0, 0, 0, 0)
  date.setMinutes(minutesFromMidnight)
  return date
}

function getShiftStartTime(productionDate, lineType, scheduleSettings) {
  return createShiftTime(productionDate, getScheduleProfile(lineType, productionDate, scheduleSettings).startMinute)
}

function getShiftEndTime(productionDate, lineType, scheduleSettings) {
  return createShiftTime(productionDate, getScheduleProfile(lineType, productionDate, scheduleSettings).endMinute)
}

function getProductionDateFromTimestamp(timestamp, lineType, scheduleSettings) {
  const uploadTime = new Date(timestamp)
  if (Number.isNaN(uploadTime.getTime())) {
    return null
  }

  const productionDate = new Date(uploadTime)
  productionDate.setHours(0, 0, 0, 0)
  const minutesFromMidnight = uploadTime.getHours() * 60 + uploadTime.getMinutes()
  const profile = getScheduleProfile(lineType, productionDate, scheduleSettings)

  if (profile.endMinute > 24 * 60 && minutesFromMidnight < profile.endMinute - 24 * 60) {
    productionDate.setDate(productionDate.getDate() - 1)
  }

  return productionDate
}

function getModStartTime(uploadedAt, holidays, lineType, scheduleSettings) {
  const uploadTime = new Date(uploadedAt)
  if (Number.isNaN(uploadTime.getTime())) {
    return null
  }

  let productionDate = getProductionDateFromTimestamp(uploadTime, lineType, scheduleSettings)
  if (!productionDate) {
    return null
  }

  let currentTime = new Date(uploadTime)
  let shiftStart = getShiftStartTime(productionDate, lineType, scheduleSettings)
  let shiftEnd = getShiftEndTime(productionDate, lineType, scheduleSettings)

  if (currentTime < shiftStart) {
    currentTime = new Date(shiftStart)
  }

  if (currentTime >= shiftEnd) {
    productionDate.setDate(productionDate.getDate() + 1)
    productionDate = getNextWorkingDay(productionDate, holidays)
    shiftStart = getShiftStartTime(productionDate, lineType, scheduleSettings)
    shiftEnd = getShiftEndTime(productionDate, lineType, scheduleSettings)
    currentTime = new Date(shiftStart)
  }

  currentTime = skipProductionBreaks(currentTime, productionDate, lineType, scheduleSettings)
  if (currentTime >= shiftEnd) {
    productionDate.setDate(productionDate.getDate() + 1)
    productionDate = getNextWorkingDay(productionDate, holidays)
    currentTime = getShiftStartTime(productionDate, lineType, scheduleSettings)
  }

  return { productionDate, currentTime }
}

function getBreakWindows(productionDate, lineType, scheduleSettings) {
  return getScheduleProfile(lineType, productionDate, scheduleSettings).breaks.map((breakWindow) => ({
    start: createShiftTime(productionDate, breakWindow.start),
    end: createShiftTime(productionDate, breakWindow.end),
  }))
}

function skipProductionBreaks(date, productionDate, lineType, scheduleSettings) {
  let adjustedDate = new Date(date)
  let moved = true

  while (moved) {
    moved = false
    for (const breakWindow of getBreakWindows(productionDate, lineType, scheduleSettings)) {
      if (adjustedDate >= breakWindow.start && adjustedDate < breakWindow.end) {
        adjustedDate = new Date(breakWindow.end)
        moved = true
        break
      }
    }
  }

  return adjustedDate
}

function addProductionMinutes(date, minutes, productionDate, lineType, scheduleSettings) {
  let currentTime = skipProductionBreaks(date, productionDate, lineType, scheduleSettings)
  let remainingMinutes = minutes

  while (remainingMinutes > 0) {
    const nextBreak = getBreakWindows(productionDate, lineType, scheduleSettings).find((breakWindow) => currentTime < breakWindow.end)
    if (!nextBreak) {
      return new Date(currentTime.getTime() + remainingMinutes * 60000)
    }

    if (currentTime >= nextBreak.start) {
      currentTime = new Date(nextBreak.end)
      continue
    }

    const minutesUntilBreak = (nextBreak.start.getTime() - currentTime.getTime()) / 60000
    if (remainingMinutes <= minutesUntilBreak) {
      return skipProductionBreaks(new Date(currentTime.getTime() + remainingMinutes * 60000), productionDate, lineType, scheduleSettings)
    }

    remainingMinutes -= minutesUntilBreak
    currentTime = new Date(nextBreak.end)
  }

  return skipProductionBreaks(currentTime, productionDate, lineType, scheduleSettings)
}

function getDayCapacity(baseCapacity, currentDayMinutes, standardMinutes) {
  return currentDayMinutes === standardMinutes
    ? baseCapacity
    : Math.max(1, Math.floor(baseCapacity * (currentDayMinutes / standardMinutes)))
}

function applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType = 'HDT', baselineRows = [], scheduleSettings) {
  const [year, month, day] = startDate.split('-').map((value) => Number.parseInt(value, 10))
  let currentDate = getNextWorkingDay(new Date(year, month - 1, day), holidays)
  let releaseStarted = false
  let releaseCounter = 1
  let todayCapacity = baseCapacity
  const standardMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
  const releaseBaseline = buildReleaseSequenceBaseline(baselineRows)
  const hasReleaseBaseline = releaseBaseline.size > 0

  for (const row of rows) {
    const status = normalizeLookupKey(getPreviewValue(row, ['Status', 'STATUS', 'status']))
    const state = getPreviewOrderState(row)
    if (!releaseStarted && status === 'PBS' && state === 'CREATED') {
      releaseStarted = true
      const baselineSequence = Number.parseInt(releaseBaseline.get(getPreviewVehicleKey(row)), 10)
      if (hasReleaseBaseline && Number.isFinite(baselineSequence) && baselineSequence > 0) {
        releaseCounter = baselineSequence
      }
    }

    if (!releaseStarted) {
      row[RELEASE_SEQUENCE_COLUMN] = ''
      continue
    }

    if (releaseCounter === 1) {
      todayCapacity = getDayCapacity(baseCapacity, getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes, standardMinutes)
    }

    row[RELEASE_SEQUENCE_COLUMN] = releaseCounter
    releaseCounter += 1

    if (releaseCounter > todayCapacity) {
      releaseCounter = 1
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate = getNextWorkingDay(currentDate, holidays)
    }
  }
}

function applySequence(
  previewColumns,
  previewData,
  capacityValue,
  startDate,
  holidays,
  lineType = 'HDT',
  scheduleSettings,
  baselineRows = [],
  modUploadedAt = null,
  modStartSequence = '',
  modSkipKeys = new Set(),
) {
  if (!Array.isArray(previewColumns) || !Array.isArray(previewData) || previewData.length === 0) {
    return {
      columns: previewColumns ?? [],
      rows: previewData ?? [],
      statusLabel: 'Sequence not applied yet',
      statusTone: 'neutral',
      taktTime: null,
    }
  }

  if (!capacityValue || !startDate) {
    return {
      columns: [...previewColumns],
      rows: structuredClone(previewData),
      statusLabel: 'Sequence unapplied (missing inputs)',
      statusTone: 'warning',
      taktTime: null,
    }
  }

  const baseCapacity = Number.parseInt(capacityValue, 10)
  if (!Number.isFinite(baseCapacity) || baseCapacity <= 0) {
    return {
      columns: [...previewColumns],
      rows: structuredClone(previewData),
      statusLabel: 'Sequence unapplied (invalid capacity)',
      statusTone: 'warning',
      taktTime: null,
    }
  }

  const [year, month, day] = startDate.split('-').map((value) => Number.parseInt(value, 10))
  let currentDate = getNextWorkingDay(new Date(year, month - 1, day), holidays)
  const columns = [...previewColumns]
  const statusIndex = columns.indexOf('Status')

  if (statusIndex === -1) {
    columns.unshift(...SEQUENCE_COLUMNS)
  } else {
    columns.splice(statusIndex + 1, 0, ...SEQUENCE_COLUMNS)
  }

  const rows = structuredClone(previewData)
  const standardTotalMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
  const baseline = buildSequenceBaseline(baselineRows)
  let counter = 1
  let sequenceStarted = false
  let currentDayMinutes = standardTotalMinutes
  let todayCapacity = baseCapacity
  let taktTime = currentDayMinutes / todayCapacity
  let currentTime = getShiftStartTime(currentDate, lineType, scheduleSettings)

  if (baseline.size > 0 && modUploadedAt) {
    const firstTrimIndex = rows.findIndex((row) => {
      const status = String(row.Status ?? '').trim().toUpperCase()
      return status === 'TRIM LINE' && !modSkipKeys.has(getPreviewVehicleKey(row))
    })
    const modStart = getModStartTime(modUploadedAt, holidays, lineType, scheduleSettings)
    const anchoredSequence = Number.parseInt(modStartSequence, 10)

    rows.forEach((row) => {
      row['Line in sequence'] = ''
      row['Production Date'] = ''
      row['Line in time'] = ''
      row[RELEASE_SEQUENCE_COLUMN] = ''
    })

    if (firstTrimIndex === -1 || !modStart || !Number.isFinite(anchoredSequence) || anchoredSequence <= 0) {
      applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType, baselineRows, scheduleSettings)
      return {
        columns,
        rows,
        statusLabel:
          firstTrimIndex === -1
            ? 'MOD schedule unavailable (no non-skip TRIM LINE vehicle)'
            : !modStart
              ? 'MOD schedule unavailable (missing upload time)'
              : 'MOD schedule unavailable (enter MOD start sequence)',
        statusTone: 'warning',
        taktTime: Number.isFinite(taktTime) ? taktTime.toFixed(2) : null,
      }
    }

    let counter = anchoredSequence
    let currentDate = new Date(modStart.productionDate)
    let currentTime = new Date(modStart.currentTime)
    let isModStartDay = true

    for (let index = firstTrimIndex; index < rows.length; index += 1) {
      const row = rows[index]
      currentDayMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
      todayCapacity = getDayCapacity(baseCapacity, currentDayMinutes, standardTotalMinutes)
      taktTime = currentDayMinutes / todayCapacity

      if (!isModStartDay && counter > todayCapacity) {
        counter = 1
        currentDate.setDate(currentDate.getDate() + 1)
        currentDate = getNextWorkingDay(currentDate, holidays)
        currentTime = getShiftStartTime(currentDate, lineType, scheduleSettings)
        currentDayMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
        todayCapacity = getDayCapacity(baseCapacity, currentDayMinutes, standardTotalMinutes)
        taktTime = currentDayMinutes / todayCapacity
      }

      let shiftEnd = getShiftEndTime(currentDate, lineType, scheduleSettings)
      currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType, scheduleSettings)
      if (currentTime > shiftEnd) {
        counter = 1
        currentDate.setDate(currentDate.getDate() + 1)
        currentDate = getNextWorkingDay(currentDate, holidays)
        currentTime = getShiftStartTime(currentDate, lineType, scheduleSettings)
        currentDayMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
        todayCapacity = getDayCapacity(baseCapacity, currentDayMinutes, standardTotalMinutes)
        taktTime = currentDayMinutes / todayCapacity
        currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType, scheduleSettings)
        shiftEnd = getShiftEndTime(currentDate, lineType, scheduleSettings)
        isModStartDay = false
      }

      row['Line in sequence'] = counter
      row['Production Date'] = formatDateKey(currentDate)
      row['Line in time'] = formatLineTime(currentTime)

      counter += 1

      if (currentTime >= shiftEnd) {
        counter = 1
        currentDate.setDate(currentDate.getDate() + 1)
        currentDate = getNextWorkingDay(currentDate, holidays)
        currentTime = getShiftStartTime(currentDate, lineType, scheduleSettings)
        isModStartDay = false
      }
    }

    applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType, baselineRows, scheduleSettings)

    return {
      columns,
      rows,
      statusLabel: 'MOD schedule refreshed from upload time',
      statusTone: 'success',
      taktTime: Number.isFinite(taktTime) ? taktTime.toFixed(2) : null,
    }
  }

  for (const row of rows) {
    const status = String(row.Status ?? '').trim().toUpperCase()
    if (!sequenceStarted && status === 'TRIM LINE') {
      sequenceStarted = true
    }

    if (!sequenceStarted) {
      row['Line in sequence'] = ''
      row['Production Date'] = ''
      row['Line in time'] = ''
      row[RELEASE_SEQUENCE_COLUMN] = ''
      continue
    }

    if (counter === 1) {
      currentDayMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
      todayCapacity = getDayCapacity(baseCapacity, currentDayMinutes, standardTotalMinutes)
      taktTime = currentDayMinutes / todayCapacity

      currentTime = getShiftStartTime(currentDate, lineType, scheduleSettings)
    }

    currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType, scheduleSettings)
    if (currentTime > getShiftEndTime(currentDate, lineType, scheduleSettings)) {
      counter = 1
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate = getNextWorkingDay(currentDate, holidays)
      currentDayMinutes = getScheduleProfile(lineType, currentDate, scheduleSettings).totalMinutes
      todayCapacity = getDayCapacity(baseCapacity, currentDayMinutes, standardTotalMinutes)
      taktTime = currentDayMinutes / todayCapacity
      currentTime = addProductionMinutes(getShiftStartTime(currentDate, lineType, scheduleSettings), taktTime, currentDate, lineType, scheduleSettings)
    }

    row['Line in sequence'] = counter
    row['Production Date'] = formatDateKey(currentDate)
    row['Line in time'] = formatLineTime(currentTime)

    counter += 1
    if (counter > todayCapacity) {
      counter = 1
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate = getNextWorkingDay(currentDate, holidays)
    }
  }

  applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType, [], scheduleSettings)

  return {
    columns,
    rows,
    statusLabel: 'Sequence and dates applied',
    statusTone: 'success',
    taktTime: Number.isFinite(taktTime) ? taktTime.toFixed(2) : null,
  }
}

function buildInference(rows, shortageParts, shortagePartNames = {}) {
  if (!Array.isArray(shortageParts) || shortageParts.length === 0) {
    return []
  }

  const allDates = [...new Set(rows.map((row) => row['Production Date']).filter(Boolean))].sort()
  const getPartName = (part) => shortagePartNames[part] ?? shortagePartNames[normalizePartKey(part)] ?? ''

  return shortageParts.map((part) => {
    const partName = getPartName(part)
    const connectedRows = rows.filter((row) => row[part])
    const impactedRows = connectedRows.filter((row) => SHORTAGE_MARKERS.has(String(row[part])))
    const scheduledConnectedRows = connectedRows.filter((row) => row['Production Date'])
    const scheduledImpactedRows = impactedRows.filter((row) => row['Production Date'])

    if (impactedRows.length === 0) {
      return {
        part,
        partName,
        covered: true,
      }
    }

    const firstImpactedRow = scheduledImpactedRows[0]
    const shortageDate = firstImpactedRow?.['Production Date'] ?? 'Not Scheduled'
    const impactTime = firstImpactedRow?.['Line in time'] ?? 'Not Scheduled'
    const connectingModels = [...new Set(impactedRows.map((row) => row.Model || 'Unknown'))].join(', ')
    const firstDaySequences = scheduledImpactedRows
      .filter((row) => row['Production Date'] === shortageDate)
      .map((row) => row['Line in sequence'])
      .filter(Boolean)
      .join(', ')

    let forecast = []
    if (scheduledImpactedRows.length > 0) {
      const startIndex = allDates.indexOf(shortageDate)
      const forecastDates = allDates.slice(startIndex, startIndex + 4)
      forecast = forecastDates.map((dateKey) => ({
        date: dateKey,
        dayPlan: scheduledConnectedRows.filter((row) => row['Production Date'] === dateKey).length,
        shortageQty: scheduledImpactedRows.filter((row) => row['Production Date'] === dateKey).length,
      }))
    }

    return {
      part,
      partName,
      covered: false,
      shortageDate,
      impactTime,
      connectingModels,
      firstDaySequences: firstDaySequences || 'None',
      forecast,
      unscheduled: scheduledImpactedRows.length === 0,
    }
  })
}

function buildPieData(stratification, palette) {
  const labels = Object.keys(stratification ?? {})
  const values = Object.values(stratification ?? {})

  return {
    labels: labels.map((label, index) => `${label} (${values[index]})`),
    datasets: [
      {
        data: values,
        backgroundColor: palette,
        borderWidth: 0,
      },
    ],
  }
}

function buildBarOptions(orders, categoryKey) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    plugins: {
      legend: { display: false },
      datalabels: {
        color: '#12345b',
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 13 },
        formatter: (value) => (value > 0 ? value : ''),
      },
      tooltip: {
        callbacks: {
          label(context) {
            const count = context.raw
            if (count === 0) {
              return 'Count: 0'
            }

            const breakdown = {}
            for (const order of orders) {
              if (order[categoryKey] === context.label) {
                const model = order.model || 'Unknown'
                breakdown[model] = (breakdown[model] || 0) + 1
              }
            }

            return [
              `Total Count: ${count}`,
              '',
              ...Object.keys(breakdown)
                .sort()
                .map((key) => `• ${key}: ${breakdown[key]}`),
            ]
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(18, 52, 91, 0.12)' },
      },
      x: {
        grid: { display: false },
      },
    },
  }
}

function buildSimpleBarData(labels, values, colors) {
  return {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderRadius: 10,
        borderSkipped: false,
      },
    ],
  }
}

function getStatusCellClass(column, value) {
  const status = normalizeLookupKey(value)

  if (column === 'Engine status') {
    if (['CONSUMES', 'CONSUMED', 'DRESSING', 'FG', 'BOOKED NOT YET STORED', 'RAPID PRIME', 'RETRIEVAL TRIGGER RECEIVED'].some((keyword) => status.includes(keyword))) {
      return 'cell-status-green'
    }
    if (['PAINT AREA', 'TESTED BUFFER', 'FLY WHEEL BUFFER', 'FLY WHEEL AREA'].some((keyword) => status.includes(keyword))) {
      return 'cell-status-yellow'
    }
    return 'cell-status-red'
  }

  if (column === 'Transmission status') {
    if (['DRESSING', 'CONSUMED', 'RETRIEVAL TRIGGER RECEIVED', 'RETRIEVED', 'RETREIVED', 'FG'].some((keyword) => status.includes(keyword))) {
      return 'cell-status-green'
    }
    if (['TEST COMPLETED BUFFER', 'RE-OIL FILLED BUFFER'].some((keyword) => status.includes(keyword))) {
      return 'cell-status-yellow'
    }
    return 'cell-status-red'
  }

  if (column === 'Axle status') {
    if (status === 'AVAILABLE') {
      return 'cell-status-green'
    }
    if (status === 'IN TRANSIT') {
      return 'cell-status-yellow'
    }
    if (status === 'WIP') {
      return 'cell-status-orange'
    }
    if (status === 'NOT STARTED') {
      return 'cell-status-red'
    }
  }

  if (column === 'Frame status') {
    if (status === 'COVERED' || status === 'FG') {
      return 'cell-status-green'
    }
    if (status === 'WIP') {
      return 'cell-status-yellow'
    }
    if (status === 'TO BE PROD' || status === 'YET TO START') {
      return 'cell-status-orange'
    }
    if (status === 'PART SHORTAGE') {
      return 'cell-status-red'
    }
  }

  return ''
}

const ENGINE_FG_SUMMARY_STATUSES = new Set([
  'FG',
  'BOOKED NOT YET STORED',
  'RETRIEVAL TRIGGER RECEIVED',
])
function normalizeSummaryStatus(column, value) {
  const status = normalizeLookupValue(value)

  if (column === 'Engine status' && ENGINE_FG_SUMMARY_STATUSES.has(normalizeLookupKey(status))) {
    return 'FG'
  }

  return status
}

function getLineTimeMinute(value) {
  const match = normalizeLookupValue(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) {
    return null
  }

  let hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const meridiem = match[3].toUpperCase()

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  if (hours === 12) {
    hours = 0
  }
  if (meridiem === 'PM') {
    hours += 12
  }

  const minuteOfDay = hours * 60 + minutes
  return minuteOfDay < 7 * 60 ? minuteOfDay + 24 * 60 : minuteOfDay
}

function buildStatusCounts(rows, column) {
  const counts = new Map()

  for (const row of rows) {
    const value = normalizeSummaryStatus(column, row?.[column])
    if (!value) {
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
}

function buildShiftStatusSummary(label, rows) {
  return {
    label,
    rowCount: rows.length,
    engine: buildStatusCounts(rows, 'Engine status'),
    transmission: buildStatusCounts(rows, 'Transmission status'),
    axle: buildStatusCounts(rows, 'Axle status'),
    frame: buildStatusCounts(rows, 'Frame status'),
  }
}

function buildCurrentDayStatusSummary(rows = [], lineType = 'HDT', scheduleSettings) {
  const currentDay = rows.find((row) => normalizeLookupValue(row?.['Production Date']))?.['Production Date'] ?? ''
  const dayRows = currentDay
    ? rows.filter((row) => normalizeLookupValue(row?.['Production Date']) === String(currentDay))
    : []
  const activeShifts = currentDay
    ? getScheduleProfile(lineType, new Date(`${currentDay}T00:00:00`), scheduleSettings).shifts
    : []
  const shiftSummaries = activeShifts.map((shift) => {
    const shiftRows = dayRows.filter((row) => {
      const lineMinute = getLineTimeMinute(row?.['Line in time'])
      return lineMinute !== null && lineMinute >= shift.startMinute && lineMinute < shift.endMinute
    })
    return buildShiftStatusSummary(shift.label, shiftRows)
  })

  return {
    currentDay,
    rowCount: dayRows.length,
    engine: buildStatusCounts(dayRows, 'Engine status'),
    transmission: buildStatusCounts(dayRows, 'Transmission status'),
    axle: buildStatusCounts(dayRows, 'Axle status'),
    frame: buildStatusCounts(dayRows, 'Frame status'),
    shifts: shiftSummaries,
  }
}

function getTableCellClass(column, value, shortageCount) {
  const statusClass = getStatusCellClass(column, value)
  if (statusClass) {
    return statusClass
  }
  if (SHORTAGE_MARKERS.has(String(value))) {
    return 'cell-shortage'
  }
  if (column === REASON_COLUMN && value === 'Released') {
    return 'cell-released'
  }
  if (value === 'Covered') {
    return 'cell-covered'
  }
  if (
    SEQUENCE_COLUMNS.includes(column) &&
    value !== '' &&
    value !== null &&
    value !== undefined
  ) {
    return shortageCount > 0 ? 'cell-sequence-alert' : 'cell-sequence'
  }
  return ''
}

function isBackToBackHwcCell(rows, rowIndex, column, lineType) {
  if (lineType !== 'HDT' || column !== 'Work Content') {
    return false
  }
  const currentValue = normalizeLookupKey(rows[rowIndex]?.[column])
  if (currentValue !== 'HWC') {
    return false
  }
  const previousValue = normalizeLookupKey(rows[rowIndex - 1]?.[column])
  const nextValue = normalizeLookupKey(rows[rowIndex + 1]?.[column])
  return previousValue === 'HWC' || nextValue === 'HWC'
}

function getPreviewRowClass(shortageCount) {
  if (shortageCount === 1) return 'row-shortage-1'
  if (shortageCount === 2) return 'row-shortage-2'
  if (shortageCount === 3) return 'row-shortage-3'
  if (shortageCount >= 4) return 'row-shortage-4'
  return ''
}

function StatusSummaryTable({ title, column, rows }) {
  return (
    <div className="status-summary-block">
      <h6>{title}</h6>
      <div className="table-responsive">
        <table className="table table-bordered mb-0 data-table status-summary-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={`${column}-${row.status}`}>
                  <td className={getStatusCellClass(column, row.status)}>{row.status}</td>
                  <td className="fw-bold text-center">{row.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="text-center text-secondary py-3">
                  No status data for this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusSummaryGroup({ summary }) {
  return (
    <div className="status-summary-paired">
      <div className="status-summary-grid">
        <StatusSummaryTable
          title="Engine status"
          column="Engine status"
          rows={summary.engine}
        />
        <StatusSummaryTable
          title="Transmission status"
          column="Transmission status"
          rows={summary.transmission}
        />
      </div>
      <div className="status-summary-grid">
        <StatusSummaryTable
          title="Axle status"
          column="Axle status"
          rows={summary.axle}
        />
        <StatusSummaryTable
          title="Frame coverage"
          column="Frame status"
          rows={summary.frame}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, tone, icon }) {
  return (
    <div className="col-12 col-md-6">
      <div className={`stat-card stat-card-${tone}`}>
        <div className="stat-label">
          <i className={`bi ${icon}`} />
          <span>{label}</span>
        </div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  )
}

function EmptyChart({ message }) {
  return <div className="chart-empty">{message}</div>
}

function PieChartCard({ title, icon, data, emptyMessage }) {
  const hasData = data.labels.length > 0
  return (
    <div className="panel-card h-100">
      <div className="panel-card-header">
        <span>
          <i className={`bi ${icon}`} /> {title}
        </span>
      </div>
      <div className="panel-card-body chart-body">
        {hasData ? (
          <Pie
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right',
                  labels: { boxWidth: 16, font: { size: 16, weight: 'bold' } },
                },
                datalabels: { display: false },
              },
            }}
          />
        ) : (
          <EmptyChart message={emptyMessage} />
        )}
      </div>
    </div>
  )
}

function BarChartCard({ title, icon, labels, values, colors, orders, categoryKey }) {
  const hasData = Math.max(...values, 0) > 0
  return (
    <div className="panel-card h-100 compact-card">
      <div className="panel-card-header compact-header">
        <span>
          <i className={`bi ${icon}`} /> {title}
        </span>
      </div>
      <div className="panel-card-body mini-chart-body">
        {hasData ? (
          <Bar data={buildSimpleBarData(labels, values, colors)} options={buildBarOptions(orders, categoryKey)} />
        ) : (
          <EmptyChart message="No data" />
        )}
      </div>
    </div>
  )
}

function Toasts({ items, onDismiss }) {
  return (
    <div className="toast-stack">
      {items.map((toast) => (
        <div key={toast.id} className={`alert alert-${toast.type} shadow-sm`} role="alert">
          <div className="d-flex justify-content-between gap-3 align-items-start">
            <span>{toast.message}</span>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => onDismiss(toast.id)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function LandingPage({ onEnter }) {
  return (
    <section className="landing-page" style={{ backgroundImage: `url(${LANDING_IMAGE_URL})` }}>
      <div className="landing-overlay" />
      <div className="landing-content">
        <h1>Production Planning and Control</h1>
        <h2>Prime Sequence Analyser</h2>
        <button type="button" className="landing-enter" onClick={onEnter}>
          Enter
          <i className="bi bi-arrow-right" />
        </button>
      </div>
    </section>
  )
}

function ReasonControls({
  title,
  rows,
  reasonBucket,
  onGroupByChange,
  onGroupSelect,
  onGroupReasonChange,
  onGroupOutlookChange,
}) {
  const groups = getAvailableGroups(rows, reasonBucket.groupBy)
  const selectedGroup = groups.includes(reasonBucket.selectedGroup) ? reasonBucket.selectedGroup : groups[0] ?? ''
  const groupReason = selectedGroup ? reasonBucket.groupReasons[reasonBucket.groupBy]?.[selectedGroup] ?? '' : ''
  const groupOutlook = selectedGroup ? reasonBucket.groupOutlooks[reasonBucket.groupBy]?.[selectedGroup] ?? '' : ''

  return (
    <div className="reason-controls">
      <div>
        <span className="reason-controls-title">{title} common inputs</span>
        <span className="reason-controls-copy">Apply one reason and outlook to every matching order in this list.</span>
      </div>
      <div className="reason-controls-grid">
        <label className="reason-field">
          <span>Group by</span>
          <select
            className="form-select form-select-sm"
            value={reasonBucket.groupBy}
            onChange={(event) => onGroupByChange(event.target.value)}
          >
            <option value="model">Model</option>
            <option value="variant">Variant</option>
          </select>
        </label>
        <label className="reason-field">
          <span>{reasonBucket.groupBy === 'model' ? 'Model' : 'Variant'}</span>
          <select
            className="form-select form-select-sm"
            value={selectedGroup}
            onChange={(event) => onGroupSelect(event.target.value)}
            disabled={groups.length === 0}
          >
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="reason-field reason-field-wide">
          <span>Reason</span>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Enter common reason"
            value={groupReason}
            onChange={(event) => onGroupReasonChange(selectedGroup, event.target.value)}
            disabled={!selectedGroup}
          />
        </label>
        <label className="reason-field">
          <span>Outlook</span>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            value={groupOutlook}
            onChange={(event) => onGroupOutlookChange(selectedGroup, event.target.value)}
            disabled={!selectedGroup}
          />
        </label>
      </div>
    </div>
  )
}

function ResultsTable({
  title,
  icon,
  badgeClassName,
  badgeValue,
  emptyMessage,
  columns,
  rows,
  onDownload,
  fileNameHint,
  reasonBucket,
  onGroupByChange,
  onGroupSelect,
  onGroupReasonChange,
  onGroupOutlookChange,
  onOrderReasonChange,
  onOrderOutlookChange,
}) {
  const isHoldTable = icon.includes('pause')

  return (
    <section className="panel-card mb-4">
      <div className="panel-card-header">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span>
            <i className={`bi ${icon}`} /> {title}
          </span>
          <span className={`badge ${badgeClassName}`}>{badgeValue}</span>
          {fileNameHint ? <small className="text-secondary">{fileNameHint}</small> : null}
        </div>
        <button className="btn btn-sm btn-outline-secondary fw-semibold" onClick={onDownload}>
          <i className="bi bi-download me-1" />
          CSV
        </button>
      </div>
      <div className="panel-card-body p-0">
        {rows.length === 0 ? (
          <div className="empty-table">{emptyMessage}</div>
        ) : (
          <>
            <ReasonControls
              title={isHoldTable ? 'Hold' : 'Skip'}
              rows={rows}
              reasonBucket={reasonBucket}
              onGroupByChange={onGroupByChange}
              onGroupSelect={onGroupSelect}
              onGroupReasonChange={onGroupReasonChange}
              onGroupOutlookChange={onGroupOutlookChange}
            />
            <div className="table-scroll-sm">
              <table className="table table-hover table-bordered mb-0 data-table">
                <thead>
                  <tr>
                    {columns.map(([label]) => (
                      <th key={label}>{label}</th>
                    ))}
                    <th>{REASON_COLUMN}</th>
                    <th>{OUTLOOK_COLUMN}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const orderKey = getOrderKey(row, index)
                    const directReason = reasonBucket.orderReasons[orderKey]
                    const directOutlook = reasonBucket.orderOutlooks[orderKey]
                    const effectiveReason = getReasonForOrder(row, reasonBucket, index)
                    const effectiveOutlook = getOutlookForOrder(row, reasonBucket, index)
                    const inheritedReason = directReason === undefined && effectiveReason
                    const inheritedOutlook = directOutlook === undefined && effectiveOutlook

                    return (
                      <tr key={`${title}-${row.serial || row.dsn || index}`} className={isHoldTable ? 'row-hold' : 'row-skip'}>
                        {columns.map(([label, key]) => (
                          <td key={`${label}-${key}`}>
                            <OrderCell field={key} value={row[key]} holdTable={isHoldTable} />
                          </td>
                        ))}
                        <td className="reason-cell">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Enter reason"
                            value={effectiveReason}
                            onChange={(event) => onOrderReasonChange(orderKey, event.target.value)}
                          />
                          {inheritedReason ? <small>Grouped by {reasonBucket.groupBy}</small> : null}
                        </td>
                        <td className="outlook-cell">
                          <input
                            type="datetime-local"
                            className="form-control form-control-sm"
                            value={effectiveOutlook}
                            onChange={(event) => onOrderOutlookChange(orderKey, event.target.value)}
                          />
                          {inheritedOutlook ? <small>Grouped by {reasonBucket.groupBy}</small> : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function CriticalPartInfoView({
  parts,
  draft,
  lookupLoading,
  sevenDaysReportFile,
  onDraftChange,
  onDraftPartBlur,
  onDraftRefresh,
  onAddPart,
  bulkInput,
  onBulkInputChange,
  onBulkAdd,
  onPartChange,
  onRemovePart,
}) {
  const plannerFields = [
    ['Part Number', 'partNumber'],
    ['Point of Fit', 'pointOfFit'],
    ['Reference order number', 'referenceOrderNumber'],
    ['Available stock', 'availableStock'],
    ['Expected qty', 'expectedQty'],
    ['Expected ETA', 'expectedEta'],
  ]
  const autoFields = [
    ['Part Description', 'partDescription'],
    ['Vendor name', 'vendorName'],
    ['Supplier backlog', 'supplierBacklog'],
    ['PMC name', 'pmcName'],
    ['SM name', 'smName'],
    ['L4 name', 'l4Name'],
  ]
  const getCoverageStatusClass = (status) => {
    const normalizedStatus = normalizeLookupKey(status)
    if (normalizedStatus === 'SHORTAGE') return 'coverage-status-shortage'
    if (normalizedStatus === 'AVAILABLE') return 'coverage-status-available'
    if (normalizedStatus === 'NOT IN DEMAND') return 'coverage-status-not-demand'
    return 'coverage-status-neutral'
  }
  const renderCoverage = (coverage = []) => {
    const defaultCoverage = [
      { day: 'N', dayStatus: '', shifts: [{ label: 'A Shift', qty: '', status: '' }, { label: 'B Shift', qty: '', status: '' }] },
      { day: 'N+1', dayStatus: '', shifts: [{ label: 'A Shift', qty: '', status: '' }, { label: 'B Shift', qty: '', status: '' }] },
      { day: 'N+2', dayStatus: '', shifts: [{ label: 'A Shift', qty: '', status: '' }, { label: 'B Shift', qty: '', status: '' }] },
      { day: 'N+3', dayStatus: '', shifts: [{ label: 'A Shift', qty: '', status: '' }, { label: 'B Shift', qty: '', status: '' }] },
      { day: 'N+4', dayStatus: '', shifts: [{ label: 'A Shift', qty: '', status: '' }, { label: 'B Shift', qty: '', status: '' }] },
    ]
    const coverageByDay = new Map((Array.isArray(coverage) ? coverage : []).map((day) => [day.day, day]))
    const safeCoverage = defaultCoverage.map((day) => ({
      ...day,
      ...(coverageByDay.get(day.day) ?? {}),
    }))

    return (
      <div className="coverage-panel">
        <h6>N, N+1, N+2, N+3, N+4 Coverage</h6>
        <div className="coverage-day-grid">
          {safeCoverage.map((day) => (
            <div className="coverage-day-card" key={day.day}>
              <div className="coverage-day-header">
                <strong>{day.day}</strong>
              </div>
              <div className="coverage-shifts">
                {(day.shifts ?? []).map((shift) => (
                  <div className="coverage-shift-row" key={`${day.day}-${shift.label}`}>
                    <div className="coverage-shift-label">
                      <span className={`coverage-status-dot ${getCoverageStatusClass(shift.status)}`} title={shift.status || 'No status'} />
                      <span>{shift.label}</span>
                    </div>
                    <strong>{shift.qty !== '' && shift.qty !== null && shift.qty !== undefined ? shift.qty : '-'}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  const renderField = (record, field, label, onChange, onBlur) => (
    <label className="critical-part-field" key={`${record.id ?? 'draft'}-${field}`}>
      <span>{label}</span>
      <input
        type={field === 'expectedEta' ? 'datetime-local' : field === 'availableStock' || field === 'expectedQty' ? 'number' : 'text'}
        className="form-control form-control-sm"
        min={field === 'availableStock' || field === 'expectedQty' ? '0' : undefined}
        value={record[field]}
        onBlur={field === 'partNumber' ? onBlur : undefined}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
    </label>
  )
  const renderGroupedFields = (record, onChange, onPartNumberBlur) => (
    <div className="critical-part-field-groups">
      <div className="critical-part-field-group">
        <h6>Planner inputs</h6>
        <div className="critical-part-grid">
          {plannerFields.map(([label, field]) => renderField(record, field, label, onChange, onPartNumberBlur))}
        </div>
      </div>
      <div className="critical-part-field-group critical-part-auto-group">
        <h6>Part Details</h6>
        <div className="critical-part-grid">
          {autoFields.map(([label, field]) => renderField(record, field, label, onChange))}
        </div>
        {renderCoverage(record.requirementCoverage)}
      </div>
    </div>
  )

  return (
    <section className="panel-card mb-4 critical-part-panel">
      <div className="panel-card-header">
        <span>
          <i className="bi bi-exclamation-diamond text-danger" /> Critical Part info
        </span>
        <small className="text-secondary">
          {sevenDaysReportFile ? sevenDaysReportFile.name : 'Upload the 7 days report in Step 3 for part lookup.'}
        </small>
      </div>
      <div className="panel-card-body">
        {parts.length > 0 ? (
          <div className="critical-part-list">
            {parts.map((part, index) => (
              <div className="critical-part-item" key={part.id}>
                <div className="critical-part-item-header">
                  <strong>Part {index + 1}</strong>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRemovePart(part.id)}>
                    <i className="bi bi-trash" />
                  </button>
                </div>
                {renderGroupedFields(part, (patch) => onPartChange(part.id, patch))}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-table mb-3">No critical part details added yet.</div>
        )}

        <div className="critical-part-add">
          <div className="critical-part-add-header">
            <strong>Add part details</strong>
            <div className="critical-part-refresh-actions">
              {lookupLoading ? <span className="text-secondary small">Looking up part details...</span> : null}
              <button
                type="button"
                className="btn btn-sm btn-outline-primary fw-semibold"
                onClick={onDraftRefresh}
                disabled={lookupLoading || !draft.partNumber.trim()}
              >
                {lookupLoading ? (
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                ) : (
                  <i className="bi bi-arrow-clockwise" />
                )}
                <span>Refresh</span>
              </button>
            </div>
          </div>
          {renderGroupedFields(draft, onDraftChange, onDraftPartBlur)}
          <button type="button" className="btn btn-primary btn-sm fw-semibold" onClick={onAddPart} disabled={lookupLoading}>
            <i className="bi bi-plus-lg me-1" />
            Add part details
          </button>
          <div className="critical-part-bulk">
            <label className="critical-part-field">
              <span>Paste multiple part numbers</span>
              <textarea
                className="form-control form-control-sm"
                rows="4"
                value={bulkInput}
                onChange={(event) => onBulkInputChange(event.target.value)}
              />
            </label>
            <button type="button" className="btn btn-outline-primary btn-sm fw-semibold" onClick={onBulkAdd} disabled={lookupLoading || !bulkInput.trim()}>
              <i className="bi bi-list-plus me-1" />
              Add pasted parts
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function OrderCell({ field, value, holdTable }) {
  const safeValue = value || '—'

  if (field === 'variant') {
    return <span className="badge text-bg-secondary">{safeValue}</span>
  }
  if (field === 'model') {
    return <span className="badge text-bg-info text-dark">{safeValue}</span>
  }
  if (field === 'vehicle_type') {
    return <span className="badge text-bg-secondary">{safeValue}</span>
  }
  if (field === 'region') {
    return <span className="badge text-bg-dark">{safeValue}</span>
  }
  if (field === 'work_content' || field === 'dsn') {
    return <span className="fw-semibold">{safeValue}</span>
  }
  if (field === 'status') {
    return <span className="state-pill state-pill-skip">{safeValue}</span>
  }
  if (field === 'vehicle_order_state' && holdTable) {
    return <span className="state-pill state-pill-hold">HOLD</span>
  }
  if (field === 'hold_status') {
    return <span className="badge text-bg-warning">{safeValue}</span>
  }
  if (field === 'serial') {
    return <code>{safeValue}</code>
  }

  return <span>{safeValue}</span>
}

function getPlanRowValue(row, aliases) {
  return getPreviewValue(row, aliases)
}

function isBusOrder(row) {
  const variant = normalizeLookupKey(getPlanRowValue(row, ['Variant', 'VARIANT', 'variant']))
  return ['V83', 'F83', 'M83', 'L83'].some((prefix) => variant.startsWith(prefix))
}

function isRapidPrimeOrder(row) {
  const engineStatus = normalizeLookupKey(row?.['Engine status'])
  const variant = normalizeLookupKey(getPlanRowValue(row, ['Variant', 'VARIANT', 'variant']))
  return engineStatus.includes('RAPID PRIME') || (variant.length >= 11 && ['U', 'T'].includes(variant[10]))
}

function incrementCount(map, key) {
  const safeKey = normalizeLookupValue(key) || 'Unknown'
  map[safeKey] = (map[safeKey] ?? 0) + 1
}

function buildModelCounts(rows) {
  return rows.reduce((counts, row) => {
    incrementCount(counts, row.Model ?? getPlanRowValue(row, ['Model', 'MODEL', 'model']))
    return counts
  }, {})
}

function getMdtLongerWheelBaseValue(row) {
  const description = normalizeLookupKey(getPlanRowValue(row, ['Description', 'DESCRIPTION', 'description']))
  const hasAnyPattern = (patterns) => patterns.some((pattern) => description.includes(pattern))

  if (hasAnyPattern(['3160', '3760', '4250', '4500', '3360'])) {
    return 0
  }
  if (description.includes('5100')) {
    return 0.2
  }
  if (hasAnyPattern(['5050', '5300', '5900'])) {
    return 0.22
  }
  if (description.includes('6700')) {
    return 0.35
  }
  if (description.includes('4800')) {
    return isBusOrder(row) ? 0.22 : 0
  }
  return 0
}

function buildPlanSummary(rows = [], openingColumns = [], lineType = 'HDT') {
  const currentDay = rows.find((row) => normalizeLookupValue(row?.['Production Date']))?.['Production Date'] ?? ''
  const currentDayRows = currentDay
    ? rows.filter((row) => normalizeLookupValue(row?.['Production Date']) === String(currentDay) && normalizeLookupValue(row?.['Line in sequence']))
    : []
  const podestStateColumn =
    openingColumns.find((column) => normalizeLookupKey(column) === 'PODEST STATE') ??
    openingColumns[39] ??
    ''
  const busRows = currentDayRows.filter(isBusOrder)
  const rapidPrimeRows = currentDayRows.filter(isRapidPrimeOrder)
  const vajraRows = currentDayRows.filter((row) => VAJRA_VARIANTS.has(normalizeLookupKey(getPlanRowValue(row, ['Variant', 'VARIANT', 'variant']))))
  const variantCounts = PLAN_VARIANT_TARGETS.map((target) => ({
    ...target,
    count: currentDayRows.filter((row) => normalizeLookupKey(getPlanRowValue(row, ['Variant', 'VARIANT', 'variant'])) === target.variant).length,
  }))
  const broCount = currentDayRows.filter((row) => normalizeLookupKey(getPlanRowValue(row, ['Description', 'DESCRIPTION', 'description'])).endsWith('RB')).length
  const podestOpeningFg = podestStateColumn
    ? busRows.filter((row) => normalizeLookupKey(row?.[podestStateColumn]) === 'BOOKED').length
    : 0
  const longerWheelBaseSum = lineType === 'MDT'
    ? currentDayRows.reduce((total, row) => total + getMdtLongerWheelBaseValue(row), 0)
    : 0

  return {
    lineType,
    currentDay,
    currentDayRows,
    bus: {
      total: busRows.length,
      modelCounts: buildModelCounts(busRows),
      podestOpeningFg,
    },
    rapidPrime: {
      total: rapidPrimeRows.length,
      modelCounts: buildModelCounts(rapidPrimeRows),
    },
    vajra: {
      total: vajraRows.length,
      modelCounts: buildModelCounts(vajraRows),
    },
    variantCounts,
    broCount,
    longerWheelBase: {
      total: Math.ceil(longerWheelBaseSum),
      rawTotal: longerWheelBaseSum,
    },
  }
}

function CountList({ counts }) {
  const rows = Object.entries(counts ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (!rows.length) {
    return <span className="text-secondary">No orders</span>
  }

  return (
    <div className="plan-count-list">
      {rows.map(([label, count]) => (
        <span key={label}>
          <strong>{label}</strong>
          {count}
        </span>
      ))}
    </div>
  )
}

function PlanSummaryView({ summary, columns }) {
  const isMdtPlan = summary.lineType === 'MDT'

  return (
    <>
      <section className="panel-card mb-4">
        <div className="panel-card-header">
          <span>
            <i className="bi bi-clipboard-check text-primary" /> Plan message
          </span>
          <small className="text-secondary">
            {summary.currentDay
              ? `${summary.currentDay} · ${summary.currentDayRows.length} line-in vehicles`
              : 'No current-day line-in plan available'}
          </small>
        </div>
        <div className="panel-card-body">
          <div className={`plan-summary-grid ${isMdtPlan ? 'plan-summary-grid-mdt' : ''}`}>
            <div className="plan-summary-card">
              <h6>BUS orders</h6>
              <strong>{summary.bus.total}</strong>
              <CountList counts={summary.bus.modelCounts} />
              <p>Podest opening FG: <b>{summary.bus.podestOpeningFg}</b></p>
            </div>
            {isMdtPlan ? (
              <div className="plan-summary-card">
                <h6>Longer wheel base vehicles</h6>
                <strong>{summary.longerWheelBase.total}</strong>
                <p>Calculated total: <b>{summary.longerWheelBase.rawTotal.toFixed(2)}</b></p>
              </div>
            ) : (
              <>
                <div className="plan-summary-card">
                  <h6>Rapid Prime</h6>
                  <strong>{summary.rapidPrime.total}</strong>
                  <CountList counts={summary.rapidPrime.modelCounts} />
                </div>
                <div className="plan-summary-card">
                  <h6>Vajra</h6>
                  <strong>{summary.vajra.total}</strong>
                  <CountList counts={summary.vajra.modelCounts} />
                </div>
              </>
            )}
            {!isMdtPlan ? (
              <div className="plan-summary-card">
                <h6>Special variants</h6>
                <div className="plan-count-list">
                  {summary.variantCounts.map((item) => (
                    <span key={item.label}>
                      <strong>{item.label}</strong>
                      {item.count}
                    </span>
                  ))}
                  <span>
                    <strong>BRO</strong>
                    {summary.broCount}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel-card mb-4">
        <div className="panel-card-header">
          <span>
            <i className="bi bi-list-check text-primary" /> Current-day line-in vehicle list
          </span>
          <small className="text-secondary">Opening report rows for the current production day</small>
        </div>
        <div className="panel-card-body p-0">
          <div className="preview-table-wrap">
            <table className="table table-bordered table-hover mb-0 data-table preview-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} className={SEQUENCE_COLUMNS.includes(column) ? 'sequence-head' : ''}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.currentDayRows.length > 0 ? (
                  summary.currentDayRows.map((row, rowIndex) => {
                    const shortageCount = getShortageCount(row)
                    return (
                      <tr key={`plan-${rowIndex}-${row['Serial Number'] || row.Serial || rowIndex}`} className={getPreviewRowClass(shortageCount)}>
                        {columns.map((column) => (
                          <td key={`${column}-${rowIndex}`} className={getTableCellClass(column, row[column] ?? '', shortageCount)}>
                            {String(row[column] ?? '')}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={columns.length || 1} className="text-center text-secondary py-4">
                      No current-day line-in vehicles found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}

function SettingsView({ lineType, settings, onBack, onReset, onNumberOfShiftsChange, onShiftChange, onBreakChange }) {
  const activeShiftCount = Math.min(Math.max(Number.parseInt(settings.numberOfShifts, 10) || 1, 1), 3)

  return (
    <main className="container-fluid px-3 px-xl-4 pb-5">
      <section className="settings-shell">
        <div className="settings-header">
          <div>
            <span className="line-type-kicker">Settings</span>
            <h2>{LINE_TYPES[lineType].title} production timing</h2>
            <p>Configure shift count, shift timings, breaks, and lunch windows used for sequence scheduling.</p>
          </div>
          <div className="settings-actions">
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onReset}>
              <i className="bi bi-arrow-counterclockwise" /> Reset defaults
            </button>
            <button className="btn btn-primary btn-sm" type="button" onClick={onBack}>
              <i className="bi bi-check2" /> Done
            </button>
          </div>
        </div>

        <div className="settings-grid">
          <section className="panel-card">
            <div className="panel-card-header">
              <span><i className="bi bi-clock-history text-primary" /> Shifts</span>
            </div>
            <div className="panel-card-body">
              <label className="form-label fw-semibold small">Number of Shifts</label>
              <input
                type="number"
                min="1"
                max="3"
                className="form-control form-control-sm settings-number-input"
                value={settings.numberOfShifts}
                onChange={(event) => onNumberOfShiftsChange(event.target.value)}
              />

              <div className="settings-list mt-3">
                {settings.shifts.map((shift, index) => (
                  <div className={`settings-row ${index >= activeShiftCount ? 'muted-row' : ''}`} key={shift.label}>
                    <strong>{shift.label}</strong>
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        className="form-control form-control-sm"
                        value={shift.start}
                        onChange={(event) => onShiftChange(index, { start: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        className="form-control form-control-sm"
                        value={shift.end}
                        onChange={(event) => onShiftChange(index, { end: event.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card-header">
              <span><i className="bi bi-cup-hot text-primary" /> Breaks and lunch</span>
            </div>
            <div className="panel-card-body">
              <div className="settings-list">
                {settings.breaks.map((breakWindow, index) => (
                  <div className="settings-row break-row" key={breakWindow.id}>
                    <strong>{breakWindow.label}</strong>
                    <select
                      className="form-select form-select-sm"
                      value={breakWindow.type}
                      onChange={(event) => onBreakChange(index, { type: event.target.value })}
                    >
                      <option>Break</option>
                      <option>Lunch</option>
                    </select>
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        className="form-control form-control-sm"
                        value={breakWindow.start}
                        onChange={(event) => onBreakChange(index, { start: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        className="form-control form-control-sm"
                        value={breakWindow.end}
                        onChange={(event) => onBreakChange(index, { end: event.target.value })}
                      />
                    </label>
                    {breakWindow.thursdayOnly ? <span className="settings-chip">Thursday only</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function App() {
  const fileInputId = useId()
  const shortageBatchInputId = useId()
  const shortageIntro =
    'Upload variant Excel files, confirm the derived part number, and provide part name, reference order, and quantity for each shortage.'
  const [reportFiles, setReportFiles] = useState({ opening: null, mod: null })
  const [reportUploadedAt, setReportUploadedAt] = useState({ opening: null, mod: null })
  const [modStartSequence, setModStartSequence] = useState('')
  const [sevenDaysReportFile, setSevenDaysReportFile] = useState(null)
  const [engineStatusFile, setEngineStatusFile] = useState(null)
  const [axleStatusFile, setAxleStatusFile] = useState(null)
  const [frameStatusFile, setFrameStatusFile] = useState(null)
  const [dragActiveReport, setDragActiveReport] = useState(null)
  const [capacity, setCapacity] = useState('')
  const [startDate, setStartDate] = useState('')
  const [lineType] = useState(getInitialLineType)
  const [scheduleSettings, setScheduleSettings] = useState(() => createDefaultScheduleSettings(getInitialLineType()))
  const [showSettings, setShowSettings] = useState(false)
  const [holidayInput, setHolidayInput] = useState('')
  const [holidays, setHolidays] = useState([])
  const [shortages, setShortages] = useState([createShortageRow()])
  const [analyses, setAnalyses] = useState({ opening: null, mod: null })
  const [activeReport, setActiveReport] = useState('opening')
  const [reasonConfig, setReasonConfig] = useState(createReasonState)
  const [criticalParts, setCriticalParts] = useState([])
  const [criticalPartDraft, setCriticalPartDraft] = useState(() => createCriticalPartRow())
  const [criticalPartBulkInput, setCriticalPartBulkInput] = useState('')
  const [criticalLookupLoading, setCriticalLookupLoading] = useState(false)
  const [showLanding, setShowLanding] = useState(getInitialLandingState)
  const [loading, setLoading] = useState(false)
  const [savingConstraints, setSavingConstraints] = useState(false)
  const [toasts, setToasts] = useState([])
  const resultsRef = useRef(null)
  const toastCounterRef = useRef(0)
  const workspaceLoadedRef = useRef(false)
  const workspaceSaveTimerRef = useRef(null)
  const shortagePartNames = shortages.reduce((partNames, shortage) => {
    const part = shortage.part.trim()
    const partName = shortage.partName.trim()
    if (part) {
      partNames[part] = partName
      partNames[normalizePartKey(part)] = partName
    }
    return partNames
  }, {})
  const analysis = analyses[activeReport] ?? analyses.opening ?? analyses.mod
  const availableReports = Object.keys(REPORT_TYPES).filter((reportKey) => analyses[reportKey])
  const availableReportViews = analyses.opening
    ? [...availableReports, 'plan', 'critical']
    : [...availableReports, 'critical']
  const activeViewType = ANALYTICS_VIEW_TYPES[activeReport] ?? REPORT_TYPES.opening
  const modUploadedAt =
    reportUploadedAt.mod ??
    (reportFiles.mod?.lastModified ? new Date(reportFiles.mod.lastModified).toISOString() : null)
  const modSkipKeys = buildVehicleKeySet(analyses.mod?.skipOrders ?? [])

  const openingSequencedPreview = applySequence(
    analyses.opening?.previewColumns ?? [],
    analyses.opening?.previewData ?? [],
    capacity,
    startDate,
    holidays,
    lineType,
    scheduleSettings,
  )
  const sequencedPreview =
    activeReport === 'mod' && analyses.mod
      ? applySequence(
          analyses.mod.previewColumns ?? [],
          analyses.mod.previewData ?? [],
          capacity,
          startDate,
          holidays,
          lineType,
          scheduleSettings,
          openingSequencedPreview.rows,
          modUploadedAt,
          modStartSequence,
          modSkipKeys,
        )
      : openingSequencedPreview
  const releasedHoldKeys =
    activeReport === 'mod' && analyses.opening && analyses.mod
      ? buildReleasedHoldKeys(openingSequencedPreview.rows, sequencedPreview.rows)
      : new Set()
  const previewWithReasons = applySkipHoldReasons(sequencedPreview, analysis, reasonConfig, releasedHoldKeys)
  const openingPreviewWithReasons = applySkipHoldReasons(openingSequencedPreview, analyses.opening, reasonConfig)
  const deferredPreviewRows = useDeferredValue(previewWithReasons.rows)
  const currentDayStatusSummary = buildCurrentDayStatusSummary(previewWithReasons.rows, lineType, scheduleSettings)
  const planSummary = buildPlanSummary(openingSequencedPreview.rows, analyses.opening?.previewColumns ?? [], lineType)
  const inferenceCards = buildInference(sequencedPreview.rows, analysis?.summary?.shortage_parts ?? [], shortagePartNames)
  const openingStatusSummary = buildCurrentDayStatusSummary(openingPreviewWithReasons.rows, lineType, scheduleSettings)
  const openingInferenceCards = buildInference(openingPreviewWithReasons.rows, analyses.opening?.summary?.shortage_parts ?? [], shortagePartNames)

  useEffect(() => {
    if (!analysis || !resultsRef.current) {
      return
    }
    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [analysis])

  useEffect(() => {
    let cancelled = false

    readWorkspace(lineType)
      .then((workspace) => {
        if (cancelled) {
          return
        }

        if (workspace) {
          setReportFiles(workspace.reportFiles ?? { opening: null, mod: null })
          setReportUploadedAt(workspace.reportUploadedAt ?? { opening: null, mod: null })
          setModStartSequence(workspace.modStartSequence ?? '')
          setSevenDaysReportFile(workspace.sevenDaysReportFile ?? null)
          setEngineStatusFile(workspace.engineStatusFile ?? null)
          setAxleStatusFile(workspace.axleStatusFile ?? null)
          setFrameStatusFile(workspace.frameStatusFile ?? null)
          setCapacity(workspace.capacity ?? '')
          setStartDate(workspace.startDate ?? '')
          setScheduleSettings(workspace.scheduleSettings ?? createDefaultScheduleSettings(lineType))
          setShowSettings(false)
          setHolidayInput(workspace.holidayInput ?? '')
          setHolidays(Array.isArray(workspace.holidays) ? workspace.holidays : [])
          setShortages(Array.isArray(workspace.shortages) && workspace.shortages.length ? workspace.shortages : [createShortageRow()])
          setAnalyses(workspace.analyses ?? { opening: null, mod: null })
          setActiveReport(workspace.activeReport ?? 'opening')
          setReasonConfig(workspace.reasonConfig ?? createReasonState())
          setCriticalParts(Array.isArray(workspace.criticalParts) ? workspace.criticalParts : [])
          setCriticalPartDraft(workspace.criticalPartDraft ?? createCriticalPartRow())
          setCriticalPartBulkInput(workspace.criticalPartBulkInput ?? '')
        }
      })
      .catch(() => {
        pushToast('Saved workspace could not be restored in this browser.', 'warning')
      })
      .finally(() => {
        if (!cancelled) {
          workspaceLoadedRef.current = true
        }
      })

    return () => {
      cancelled = true
    }
  }, [lineType])

  useEffect(() => {
    if (!workspaceLoadedRef.current) {
      return undefined
    }

    window.clearTimeout(workspaceSaveTimerRef.current)
    workspaceSaveTimerRef.current = window.setTimeout(() => {
      writeWorkspace(lineType, {
        reportFiles,
        reportUploadedAt,
        modStartSequence,
        sevenDaysReportFile,
        engineStatusFile,
        axleStatusFile,
        frameStatusFile,
        capacity,
        startDate,
        scheduleSettings,
        holidayInput,
        holidays,
        shortages,
        analyses,
        activeReport,
        reasonConfig,
        criticalParts,
        criticalPartDraft,
        criticalPartBulkInput,
        savedAt: new Date().toISOString(),
      }).catch(() => {
        pushToast('Workspace could not be saved in this browser.', 'warning')
      })
    }, 500)

    return () => {
      window.clearTimeout(workspaceSaveTimerRef.current)
    }
  }, [lineType, reportFiles, reportUploadedAt, modStartSequence, sevenDaysReportFile, engineStatusFile, axleStatusFile, frameStatusFile, capacity, startDate, scheduleSettings, holidayInput, holidays, shortages, analyses, activeReport, reasonConfig, criticalParts, criticalPartDraft, criticalPartBulkInput])

  function pushToast(message, type = 'danger') {
    toastCounterRef.current += 1
    const id = `toast-${toastCounterRef.current}`
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 5000)
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function updateShortage(id, patch) {
    setShortages((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function addShortage() {
    setShortages((current) => [...current, createShortageRow()])
  }

  function addShortageFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) {
      return
    }

    setShortages((current) => {
      const existingRows = current.filter((row) => row.file || row.partName || row.ref || row.qty)
      return [...existingRows, ...files.map((file) => createShortageRow(file))]
    })
  }

  function updateShortageFile(id, file) {
    updateShortage(id, {
      file,
      part: file ? getPartNumberFromFileName(file.name) : '',
    })
  }

  function updateReportFile(reportKey, file) {
    setReportFiles((current) => ({
      ...current,
      [reportKey]: file,
    }))
    setReportUploadedAt((current) => ({
      ...current,
      [reportKey]: file ? new Date().toISOString() : null,
    }))
    setAnalyses((current) => ({
      ...current,
      [reportKey]: null,
    }))
    if (activeReport === reportKey) {
      setActiveReport('opening')
    }
    if (activeReport === 'plan') {
      setActiveReport('opening')
    }
  }

  function updateSevenDaysReportFile(file) {
    setSevenDaysReportFile(file)
  }

  function updateEngineStatusFile(file) {
    setEngineStatusFile(file)
    setAnalyses({ opening: null, mod: null })
    setActiveReport('opening')
  }

  function updateAxleStatusFile(file) {
    setAxleStatusFile(file)
    setAnalyses({ opening: null, mod: null })
    setActiveReport('opening')
  }

  function updateFrameStatusFile(file) {
    setFrameStatusFile(file)
    setAnalyses({ opening: null, mod: null })
    setActiveReport('opening')
  }

  function removeShortage(id) {
    setShortages((current) => {
      if (current.length === 1) {
        return [createShortageRow()]
      }
      return current.filter((row) => row.id !== id)
    })
  }

  function addHoliday() {
    if (!holidayInput || holidays.includes(holidayInput)) {
      return
    }
    setHolidays((current) => [...current, holidayInput].sort())
    setHolidayInput('')
  }

  function removeHoliday(dateKey) {
    setHolidays((current) => current.filter((holiday) => holiday !== dateKey))
  }

  function updateNumberOfShifts(value) {
    const nextValue = Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), 3)
    setScheduleSettings((current) => ({
      ...current,
      numberOfShifts: nextValue,
    }))
  }

  function updateScheduleShift(index, patch) {
    setScheduleSettings((current) => ({
      ...current,
      shifts: current.shifts.map((shift, shiftIndex) => (shiftIndex === index ? { ...shift, ...patch } : shift)),
    }))
  }

  function updateScheduleBreak(index, patch) {
    setScheduleSettings((current) => ({
      ...current,
      breaks: current.breaks.map((breakWindow, breakIndex) => (breakIndex === index ? { ...breakWindow, ...patch } : breakWindow)),
    }))
  }

  function resetScheduleSettings() {
    setScheduleSettings(createDefaultScheduleSettings(lineType))
  }

  function resetAll() {
    clearWorkspace(lineType).catch(() => {
      pushToast('Saved workspace could not be cleared in this browser.', 'warning')
    })
    setReportFiles({ opening: null, mod: null })
    setReportUploadedAt({ opening: null, mod: null })
    setModStartSequence('')
    setSevenDaysReportFile(null)
    setEngineStatusFile(null)
    setAxleStatusFile(null)
    setFrameStatusFile(null)
    setDragActiveReport(null)
    setCapacity('')
    setStartDate('')
    setScheduleSettings(createDefaultScheduleSettings(lineType))
    setShowSettings(false)
    setHolidayInput('')
    setHolidays([])
    setShortages([createShortageRow()])
    setAnalyses({ opening: null, mod: null })
    setActiveReport('opening')
    setReasonConfig(createReasonState())
    setCriticalParts([])
    setCriticalPartDraft(createCriticalPartRow())
    setCriticalPartBulkInput('')
    setCriticalLookupLoading(false)
    setToasts([])
  }

  function updateReasonBucket(kind, updater) {
    setReasonConfig((current) => ({
      ...current,
      [kind]: updater(current[kind]),
    }))
  }

  function updateReasonGroupBy(kind, groupBy) {
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      groupBy,
      selectedGroup: '',
    }))
  }

  function updateReasonGroup(kind, group) {
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      selectedGroup: group,
    }))
  }

  function updateGroupReason(kind, groupValue, reason) {
    if (!groupValue) {
      return
    }
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      groupReasons: {
        ...bucket.groupReasons,
        [bucket.groupBy]: {
          ...bucket.groupReasons[bucket.groupBy],
          [groupValue]: reason,
        },
      },
    }))
  }

  function updateGroupOutlook(kind, groupValue, outlook) {
    if (!groupValue) {
      return
    }
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      groupOutlooks: {
        ...bucket.groupOutlooks,
        [bucket.groupBy]: {
          ...bucket.groupOutlooks[bucket.groupBy],
          [groupValue]: outlook,
        },
      },
    }))
  }

  function updateOrderReason(kind, orderKey, reason) {
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      orderReasons: Object.fromEntries(
        Object.entries({
          ...bucket.orderReasons,
          [orderKey]: reason,
        }).filter(([, value]) => value !== ''),
      ),
    }))
  }

  function updateOrderOutlook(kind, orderKey, outlook) {
    updateReasonBucket(kind, (bucket) => ({
      ...bucket,
      orderOutlooks: Object.fromEntries(
        Object.entries({
          ...bucket.orderOutlooks,
          [orderKey]: outlook,
        }).filter(([, value]) => value !== ''),
      ),
    }))
  }

  function updateCriticalPartDraft(patch) {
    setCriticalPartDraft((current) => ({ ...current, ...patch }))
  }

  function parseCriticalPartNumbers(value) {
    return [...new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map(normalizeCriticalPartNumber)
        .filter(Boolean),
    )]
  }

  function updateCriticalPart(id, patch) {
    setCriticalParts((current) => current.map((part) => (part.id === id ? { ...part, ...patch } : part)))
  }

  function removeCriticalPart(id) {
    setCriticalParts((current) => current.filter((part) => part.id !== id))
  }

  async function lookupCriticalPartDetails(partNumber, { silent = false } = {}) {
    const normalizedPartNumber = normalizeCriticalPartNumber(partNumber)
    if (!normalizedPartNumber) {
      return null
    }
    if (!sevenDaysReportFile) {
      if (!silent) {
        pushToast('Upload the 7 days report before looking up critical part details.', 'warning')
      }
      return null
    }

    const formData = new FormData()
    formData.append('part_number', normalizedPartNumber)
    formData.append('seven_days_report_file', sevenDaysReportFile)

    setCriticalLookupLoading(true)
    try {
      const response = await fetch('/api/critical-part-details', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Part details could not be found.')
      }
      return result
    } catch (error) {
      if (!silent) {
        pushToast(`Part lookup failed: ${error.message}`, 'warning')
      }
      return null
    } finally {
      setCriticalLookupLoading(false)
    }
  }

  async function fillCriticalPartDraftFromReport() {
    const normalizedPartNumber = normalizeCriticalPartNumber(criticalPartDraft.partNumber)
    if (normalizedPartNumber !== criticalPartDraft.partNumber) {
      setCriticalPartDraft((current) => ({ ...current, partNumber: normalizedPartNumber }))
    }
    const details = await lookupCriticalPartDetails(normalizedPartNumber)
    if (details) {
      setCriticalPartDraft((current) => ({ ...current, ...details }))
    }
  }

  async function addCriticalPart() {
    const normalizedPartNumber = normalizeCriticalPartNumber(criticalPartDraft.partNumber)
    if (!normalizedPartNumber) {
      pushToast('Enter a part number before adding critical part details.', 'warning')
      return
    }

    const details = await lookupCriticalPartDetails(normalizedPartNumber, {
      silent: Boolean(criticalPartDraft.partDescription || criticalPartDraft.vendorName || criticalPartDraft.pmcName || criticalPartDraft.l4Name),
    })
    const nextPart = {
      ...criticalPartDraft,
      ...(details ?? {}),
      partNumber: details?.partNumber || normalizedPartNumber,
      id: createCriticalPartRow().id,
    }
    setCriticalParts((current) => [...current, nextPart])
    setCriticalPartDraft(createCriticalPartRow())
  }

  async function addBulkCriticalParts() {
    const partNumbers = parseCriticalPartNumbers(criticalPartBulkInput)
    if (!partNumbers.length) {
      pushToast('Paste at least one part number before adding critical part details.', 'warning')
      return
    }
    if (!sevenDaysReportFile) {
      pushToast('Upload the 7 days report before adding pasted part details.', 'warning')
      return
    }

    const addedParts = []
    for (const partNumber of partNumbers) {
      const details = await lookupCriticalPartDetails(partNumber, { silent: true })
      addedParts.push({
        ...createCriticalPartRow(),
        ...(details ?? {}),
        partNumber: details?.partNumber || partNumber,
      })
    }

    setCriticalParts((current) => [...current, ...addedParts])
    setCriticalPartBulkInput('')
    pushToast(`Added ${addedParts.length} pasted part${addedParts.length === 1 ? '' : 's'}.`, 'success')
  }

  async function saveConstraintsBackup() {
    if (!analyses.opening || !openingSequencedPreview.rows.length) {
      pushToast('Analyze the opening report before saving constraints.', 'warning')
      return
    }

    const mappedColumns = lineType === 'MDT'
      ? openingPreviewWithReasons.columns.filter((column) => column !== 'Work Content')
      : openingPreviewWithReasons.columns
    const mappedCsv = buildCsvText(mappedColumns, openingPreviewWithReasons.rows)
    const formData = new FormData()
    formData.append('line_type', lineType)
    formData.append('mapped_columns', JSON.stringify(mappedColumns))
    formData.append('mapped_report_file', new Blob([mappedCsv], { type: 'text/csv;charset=utf-8;' }), 'Mapped_Day_Opening_Report.csv')
    formData.append('summary', JSON.stringify(analyses.opening.summary ?? {}))
    formData.append('status_summary', JSON.stringify(openingStatusSummary))
    formData.append('inference_cards', JSON.stringify(openingInferenceCards))

    if (reportFiles.opening) {
      formData.append('opening_report_file', reportFiles.opening)
    }
    if (reportFiles.mod) {
      formData.append('mod_report_file', reportFiles.mod)
    }
    if (sevenDaysReportFile) {
      formData.append('seven_days_report_file', sevenDaysReportFile)
    }
    if (engineStatusFile) {
      formData.append('engine_status_file', engineStatusFile)
    }
    if (axleStatusFile) {
      formData.append('axle_status_file', axleStatusFile)
    }
    if (lineType === 'HDT' && frameStatusFile) {
      formData.append('frame_status_file', frameStatusFile)
    }
    for (const shortage of shortages) {
      if (shortage.file) {
        formData.append('shortage_files', shortage.file)
      }
    }

    setSavingConstraints(true)
    try {
      const response = await fetch('/api/save-constraints', { method: 'POST', body: formData })
      const responseText = await response.text()
      let result = {}
      try {
        result = responseText ? JSON.parse(responseText) : {}
      } catch {
        throw new Error(`Server returned a non-JSON response. Restart the backend and try again. Status: ${response.status}`)
      }
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Backup could not be saved.')
      }
      pushToast(`Constraints backup saved: ${result.folder}`, 'success')
    } catch (error) {
      pushToast(`Save failed: ${error.message}`, 'danger')
    } finally {
      setSavingConstraints(false)
    }
  }

  function buildAnalysisFormData(file, options = {}) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('line_type', lineType)
    if (engineStatusFile) {
      formData.append('engine_status_file', engineStatusFile)
    }
    if (axleStatusFile) {
      formData.append('axle_status_file', axleStatusFile)
    }
    if (lineType === 'HDT' && frameStatusFile) {
      formData.append('frame_status_file', frameStatusFile)
    }

    for (const key of options.openingHoldKeys ?? []) {
      formData.append('opening_hold_keys', key)
    }

    for (const shortage of shortages) {
      if (shortage.part.trim() && shortage.file) {
        formData.append('shortage_parts', shortage.part.trim())
        formData.append('shortage_refs', shortage.ref.trim())
        formData.append('shortage_qtys', shortage.qty.toString().trim())
        formData.append('shortage_usages', (shortage.usage || '1').toString().trim())
        formData.append('shortage_files', shortage.file)
      }
    }

    return formData
  }

  async function analyzeReport(file, options = {}) {
    const response = await fetch('/api/analyze', { method: 'POST', body: buildAnalysisFormData(file, options) })
    const raw = await response.json()
    if (!response.ok || raw.error) {
      throw new Error(raw.error || 'Server returned an unexpected error.')
    }
    return normalizeData(raw)
  }

  async function runAnalysis() {
    if (!reportFiles.opening) {
      pushToast('Action blocked: please upload the opening report first.', 'warning')
      return
    }

    setLoading(true)
    try {
      const nextAnalyses = {}
      nextAnalyses.opening = await analyzeReport(reportFiles.opening)

      if (reportFiles.mod) {
        nextAnalyses.mod = await analyzeReport(reportFiles.mod, {
          openingHoldKeys: buildOpeningHoldKeys(nextAnalyses.opening.previewData ?? []),
        })
      }

      startTransition(() => {
        setAnalyses((current) => ({
          ...current,
          ...nextAnalyses,
        }))
        setActiveReport(nextAnalyses.mod ? 'mod' : 'opening')
      })
    } catch (error) {
      pushToast(`Network error: ${error.message}`, 'danger')
    } finally {
      setLoading(false)
    }
  }

  function downloadPreview() {
    if (!previewWithReasons.columns.length || !previewWithReasons.rows.length) {
      pushToast('No sequence data available to download.', 'warning')
      return
    }
    triggerDownload('Sequenced_Production_Report.csv', previewColumns, previewWithReasons.rows)
  }

  function downloadHoldOrders() {
    if (!analysis?.holdOrders?.length) {
      pushToast('No hold orders available to download.', 'warning')
      return
    }
    triggerDownload('Hold_Orders.csv', holdExportColumns, analysis.holdOrders)
  }

  function downloadSkipOrders() {
    if (!analysis?.skipOrders?.length) {
      pushToast('No skip orders available to download.', 'warning')
      return
    }
    triggerDownload('Skip_Orders.csv', skipExportColumns, analysis.skipOrders)
  }

  const showWorkContent = lineType !== 'MDT'
  const holdExportColumns = showWorkContent ? HOLD_EXPORT_COLUMNS : HOLD_EXPORT_COLUMNS.filter((column) => column !== 'work_content')
  const skipExportColumns = showWorkContent ? SKIP_EXPORT_COLUMNS : SKIP_EXPORT_COLUMNS.filter((column) => column !== 'work_content')
  const holdTableColumns = showWorkContent ? HOLD_TABLE_COLUMNS : WITHOUT_WORK_CONTENT(HOLD_TABLE_COLUMNS)
  const skipTableColumns = showWorkContent ? SKIP_TABLE_COLUMNS : WITHOUT_WORK_CONTENT(SKIP_TABLE_COLUMNS)
  const previewColumns = showWorkContent ? previewWithReasons.columns : previewWithReasons.columns.filter((column) => column !== 'Work Content')
  const holdModelData = buildPieData(analysis?.summary?.hold_stratification, PIE_HOLD_COLORS)
  const skipModelData = buildPieData(analysis?.summary?.skip_stratification, PIE_SKIP_COLORS)
  const holdTypeData = [analysis?.summary?.hold_type_stratification?.Bus || 0, analysis?.summary?.hold_type_stratification?.Truck || 0]
  const skipTypeData = [analysis?.summary?.skip_type_stratification?.Bus || 0, analysis?.summary?.skip_type_stratification?.Truck || 0]
  const holdWcData = [analysis?.summary?.hold_wc_stratification?.HWC || 0, analysis?.summary?.hold_wc_stratification?.LWC || 0]
  const skipWcData = [analysis?.summary?.skip_wc_stratification?.HWC || 0, analysis?.summary?.skip_wc_stratification?.LWC || 0]
  const holdRegionData = [
    analysis?.summary?.hold_region_stratification?.Domestic || 0,
    analysis?.summary?.hold_region_stratification?.Export || 0,
  ]
  const skipRegionData = [
    analysis?.summary?.skip_region_stratification?.Domestic || 0,
    analysis?.summary?.skip_region_stratification?.Export || 0,
  ]

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />
  }

  return (
    <div className="app-shell">
      <Toasts items={toasts} onDismiss={dismissToast} />

      <header className="hero-bar">
        <div className="hero-title-wrap">
          <button className="settings-tab" type="button" onClick={() => setShowSettings(true)} title="Open settings">
            <i className="bi bi-gear" />
            <span>Settings</span>
          </button>
          <div className="hero-title-block">
            <h1>Production Planning and Control</h1>
            <p>{LINE_TYPES[lineType].title} Sequence Analyser</p>
          </div>
        </div>
      </header>

      {showSettings ? (
        <SettingsView
          lineType={lineType}
          settings={scheduleSettings}
          onBack={() => setShowSettings(false)}
          onReset={resetScheduleSettings}
          onNumberOfShiftsChange={updateNumberOfShifts}
          onShiftChange={updateScheduleShift}
          onBreakChange={updateScheduleBreak}
        />
      ) : (
      <main className="container-fluid px-3 px-xl-4 pb-5">
        <section className="line-type-panel" aria-label="Vehicle line selector">
          <div>
            <span className="line-type-kicker">Select line</span>
            <h2>{LINE_TYPES[lineType].title} Sequence Analyser</h2>
            <p>{LINE_TYPES[lineType].description}</p>
          </div>
          <div className="line-type-actions" role="group" aria-label="Select HDT or MDT">
            {Object.keys(LINE_TYPES).map((type) => (
              <a
                key={type}
                className={`line-type-button ${lineType === type ? 'active' : ''}`}
                href={lineType === type ? undefined : getLineTabUrl(type)}
                target={lineType === type ? undefined : '_blank'}
                rel={lineType === type ? undefined : 'noreferrer'}
                aria-pressed={lineType === type}
                aria-current={lineType === type ? 'page' : undefined}
                onClick={(event) => {
                  if (lineType === type) {
                    event.preventDefault()
                  }
                }}
              >
                {type}
              </a>
            ))}
          </div>
        </section>

        <section className="row g-4 mt-1">
          <div className="col-xl-4">
            <div className="step-card h-100">
              <div className="step-header">
                <span>
                  <i className="bi bi-1-circle-fill" /> Step 1: Sequence config
                </span>
              </div>
              <div className="step-body">
                <label className="form-label fw-semibold small">Daily Capacity</label>
                <div className="input-group input-group-sm mb-3">
                  <span className="input-group-text">
                    <i className="bi bi-123" />
                  </span>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    placeholder="Enter daily capacity"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                </div>

                <label className="form-label fw-semibold small">Start Date</label>
                <div className="input-group input-group-sm mb-3">
                  <span className="input-group-text">
                    <i className="bi bi-calendar-date" />
                  </span>
                  <input
                    type="date"
                    className="form-control"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>

                <label className="form-label fw-semibold small">Exclude Holidays</label>
                <div className="input-group input-group-sm">
                  <input
                    type="date"
                    className="form-control"
                    value={holidayInput}
                    onChange={(event) => setHolidayInput(event.target.value)}
                  />
                  <button className="btn btn-outline-secondary" type="button" onClick={addHoliday}>
                    <i className="bi bi-plus-lg" />
                  </button>
                </div>

                <div className="holiday-list">
                  {holidays.map((holiday) => (
                    <span key={holiday} className="badge holiday-chip">
                      {holiday}
                      <button type="button" className="chip-dismiss" onClick={() => removeHoliday(holiday)}>
                        <i className="bi bi-x-circle" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="config-note">
                  <span className={`status-pill status-pill-${sequencedPreview.statusTone}`}>
                    {sequencedPreview.statusLabel}
                  </span>
                  <span className="muted-kpi">
                    Takt time: <strong>{sequencedPreview.taktTime ? `${Math.round(Number(sequencedPreview.taktTime))} min` : 'Pending'}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-xl-4">
            <div className="step-card h-100">
              <div className="step-header with-action">
                <span>
                  <i className="bi bi-2-circle-fill" /> Step 2: Part shortages
                </span>
                <button className="btn btn-sm btn-outline-primary" type="button" onClick={addShortage}>
                  <i className="bi bi-plus" /> Add Row
                </button>
              </div>
              <div className="step-body shortage-stack">
                <p className="step-copy">{shortageIntro}</p>
                <label htmlFor={shortageBatchInputId} className="multi-upload-zone">
                  <i className="bi bi-files" />
                  <span>Upload one or more variant files</span>
                </label>
                <input
                  id={shortageBatchInputId}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  className="visually-hidden"
                  onChange={(event) => {
                    addShortageFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
                {shortages.map((shortage) => (
                  <div key={shortage.id} className="shortage-card">
                    <div className="row g-2">
                      <div className="col-sm-6">
                        <label className="form-label small fw-semibold">Part No. from file</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={shortage.part}
                          placeholder="Upload a file"
                          readOnly
                        />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label small fw-semibold">Part Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={shortage.partName}
                          placeholder="Enter part name"
                          onChange={(event) => updateShortage(shortage.id, { partName: event.target.value })}
                        />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label small fw-semibold">Reference Order</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={shortage.ref}
                          onChange={(event) => updateShortage(shortage.id, { ref: event.target.value })}
                        />
                      </div>
                      <div className="col-sm-3">
                        <label className="form-label small fw-semibold">Qty</label>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          value={shortage.qty}
                          onChange={(event) => updateShortage(shortage.id, { qty: event.target.value })}
                        />
                      </div>
                      <div className="col-sm-3">
                        <label className="form-label small fw-semibold">Usage / vehicle</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="form-control form-control-sm"
                          value={shortage.usage ?? '1'}
                          onChange={(event) => updateShortage(shortage.id, { usage: event.target.value })}
                        />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label small fw-semibold">Variant File</label>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="form-control form-control-sm"
                          onChange={(event) => updateShortageFile(shortage.id, event.target.files?.[0] ?? null)}
                        />
                      </div>
                    </div>
                    <div className="shortage-card-footer">
                      <small className="text-secondary">{shortage.file?.name || 'No variant file selected yet'}</small>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => removeShortage(shortage.id)}
                      >
                        <i className="bi bi-x" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-xl-4">
            <div className="step-card h-100">
              <div className="step-header">
                <span>
                  <i className="bi bi-3-circle-fill" /> Step 3: Upload reports
                </span>
              </div>
              <div className="step-body d-flex flex-column">
                <div className="report-upload-grid">
                  {Object.entries(REPORT_TYPES).map(([reportKey, report]) => {
                    const inputId = `${fileInputId}-${reportKey}`
                    const selectedReportFile = reportFiles[reportKey]

                    return (
                      <div key={reportKey}>
                        <label
                          htmlFor={inputId}
                          className={`report-upload-card ${dragActiveReport === reportKey ? 'drag-active' : ''}`}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setDragActiveReport(reportKey)
                          }}
                          onDragLeave={() => setDragActiveReport(null)}
                          onDrop={(event) => {
                            event.preventDefault()
                            setDragActiveReport(null)
                            const file = event.dataTransfer.files?.[0]
                            if (file) {
                              updateReportFile(reportKey, file)
                            }
                          }}
                        >
                          <i className="bi bi-file-earmark-spreadsheet upload-icon" />
                          <span className="upload-title">{report.title}</span>
                          <strong className="upload-file">{selectedReportFile?.name || 'No file selected'}</strong>
                        </label>
                        <input
                          id={inputId}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="d-none"
                          onChange={(event) => updateReportFile(reportKey, event.target.files?.[0] ?? null)}
                        />
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3">
                  <label className="form-label fw-semibold small">MOD first non-skip TRIM LINE sequence</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text">
                      <i className="bi bi-list-ol" />
                    </span>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      placeholder="Enter line in sequence"
                      value={modStartSequence}
                      onChange={(event) => setModStartSequence(event.target.value)}
                    />
                  </div>
                </div>

                <div className="report-upload-grid auxiliary-report-grid mt-3">
                  <div>
                    <label
                      htmlFor={`${fileInputId}-seven-days-report`}
                      className={`report-upload-card engine-status-upload ${dragActiveReport === 'seven-days-report' ? 'drag-active' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragActiveReport('seven-days-report')
                      }}
                      onDragLeave={() => setDragActiveReport(null)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDragActiveReport(null)
                        const file = event.dataTransfer.files?.[0]
                        if (file) {
                          updateSevenDaysReportFile(file)
                        }
                      }}
                    >
                      <i className="bi bi-calendar-week upload-icon" />
                      <span className="upload-title">7 Days Report</span>
                      <strong className="upload-file">{sevenDaysReportFile?.name || 'No 7 days report selected'}</strong>
                    </label>
                    <input
                      id={`${fileInputId}-seven-days-report`}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="d-none"
                      onChange={(event) => updateSevenDaysReportFile(event.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`${fileInputId}-engine-status`}
                      className={`report-upload-card engine-status-upload ${dragActiveReport === 'engine-status' ? 'drag-active' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragActiveReport('engine-status')
                      }}
                      onDragLeave={() => setDragActiveReport(null)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDragActiveReport(null)
                        const file = event.dataTransfer.files?.[0]
                        if (file) {
                          updateEngineStatusFile(file)
                        }
                      }}
                    >
                      <i className="bi bi-gear-wide-connected upload-icon" />
                      <span className="upload-title">Engine &amp; Transmission</span>
                      <strong className="upload-file">{engineStatusFile?.name || 'No status report selected'}</strong>
                    </label>
                    <input
                      id={`${fileInputId}-engine-status`}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="d-none"
                      onChange={(event) => updateEngineStatusFile(event.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`${fileInputId}-axle-status`}
                      className={`report-upload-card engine-status-upload ${dragActiveReport === 'axle-status' ? 'drag-active' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragActiveReport('axle-status')
                      }}
                      onDragLeave={() => setDragActiveReport(null)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDragActiveReport(null)
                        const file = event.dataTransfer.files?.[0]
                        if (file) {
                          updateAxleStatusFile(file)
                        }
                      }}
                    >
                      <i className="bi bi-circle-square upload-icon" />
                      <span className="upload-title">Axle Status</span>
                      <strong className="upload-file">{axleStatusFile?.name || 'No axle status report selected'}</strong>
                    </label>
                    <input
                      id={`${fileInputId}-axle-status`}
                      type="file"
                      accept=".xlsx,.xlsm"
                      className="d-none"
                      onChange={(event) => updateAxleStatusFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  {lineType === 'HDT' ? (
                    <div>
                      <label
                        htmlFor={`${fileInputId}-frame-status`}
                        className={`report-upload-card engine-status-upload ${dragActiveReport === 'frame-status' ? 'drag-active' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault()
                          setDragActiveReport('frame-status')
                        }}
                        onDragLeave={() => setDragActiveReport(null)}
                        onDrop={(event) => {
                          event.preventDefault()
                          setDragActiveReport(null)
                          const file = event.dataTransfer.files?.[0]
                          if (file) {
                            updateFrameStatusFile(file)
                          }
                        }}
                      >
                        <i className="bi bi-truck-front upload-icon" />
                        <span className="upload-title">Frame Status</span>
                        <strong className="upload-file">{frameStatusFile?.name || 'No frame status report selected'}</strong>
                      </label>
                      <input
                        id={`${fileInputId}-frame-status`}
                        type="file"
                        accept=".xlsx,.xlsm"
                        className="d-none"
                        onChange={(event) => updateFrameStatusFile(event.target.files?.[0] ?? null)}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="action-row">
                  <button className="btn btn-outline-secondary btn-sm px-3" type="button" onClick={resetAll}>
                    Reset
                  </button>
                  <button className="btn btn-primary btn-sm px-4 fw-semibold" type="button" disabled={loading} onClick={runAnalysis}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Analyzing
                      </>
                    ) : (
                      <>
                        <i className="bi bi-search me-1" />
                        Analyze
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {analysis ? (
          <div ref={resultsRef} className="results-shell">
            <section className="report-view-panel" aria-label="Report analytics selector">
              <div>
                <span className="line-type-kicker">Analytics view</span>
                <h2>{activeViewType.title}</h2>
                <p>{activeViewType.copy}</p>
              </div>
              <div className="report-view-actions" role="group" aria-label="Select report analytics">
                {availableReportViews.map((reportKey) => (
                  <button
                    key={reportKey}
                    type="button"
                    className={`report-view-button ${activeReport === reportKey ? 'active' : ''}`}
                    onClick={() => setActiveReport(reportKey)}
                    aria-pressed={activeReport === reportKey}
                  >
                    {ANALYTICS_VIEW_TYPES[reportKey].shortTitle}
                  </button>
                ))}
              </div>
            </section>

            {activeReport === 'critical' ? (
              <CriticalPartInfoView
                parts={criticalParts}
                draft={criticalPartDraft}
                lookupLoading={criticalLookupLoading}
                sevenDaysReportFile={sevenDaysReportFile}
                onDraftChange={updateCriticalPartDraft}
                onDraftPartBlur={fillCriticalPartDraftFromReport}
                onDraftRefresh={fillCriticalPartDraftFromReport}
                onAddPart={addCriticalPart}
                bulkInput={criticalPartBulkInput}
                onBulkInputChange={setCriticalPartBulkInput}
                onBulkAdd={addBulkCriticalParts}
                onPartChange={updateCriticalPart}
                onRemovePart={removeCriticalPart}
              />
            ) : activeReport === 'plan' ? (
              <PlanSummaryView
                summary={planSummary}
                columns={lineType === 'MDT' ? openingSequencedPreview.columns.filter((column) => column !== 'Work Content') : openingSequencedPreview.columns}
              />
            ) : (
              <>
            <section className="row g-3 mb-4 mt-1">
              <StatCard label="PBS HOLD" value={analysis.summary.total_hold || 0} tone="hold" icon="bi-pause-circle" />
              <StatCard
                label="SKIP VEHICLES"
                value={analysis.summary.total_skipped || 0}
                tone="skip"
                icon="bi-fast-forward-circle"
              />
            </section>

            <section className="chart-groups mb-4">
              <div className="chart-group">
                <PieChartCard
                  title="Stratification: Hold Orders (By Model)"
                  icon="bi-pie-chart-fill text-danger"
                  data={holdModelData}
                  emptyMessage="No hold orders to stratify."
                />
                <div className="mini-chart-grid">
                  <BarChartCard
                    title="Hold: Type"
                    icon="bi-bar-chart-line-fill text-primary"
                    labels={['Bus', 'Truck']}
                    values={holdTypeData}
                    colors={['#5f50cf', '#2ec4b6']}
                    orders={analysis.holdOrders}
                    categoryKey="vehicle_type"
                  />
                  {showWorkContent ? (
                    <BarChartCard
                      title="Hold: W/C"
                      icon="bi-bar-chart-steps text-primary"
                      labels={['HWC', 'LWC']}
                      values={holdWcData}
                      colors={['#ef476f', '#2a9d8f']}
                      orders={analysis.holdOrders}
                      categoryKey="work_content"
                    />
                  ) : null}
                  <BarChartCard
                    title="Hold: Reg."
                    icon="bi-globe-americas text-primary"
                    labels={['Domestic', 'Export']}
                    values={holdRegionData}
                    colors={['#3c91e6', '#ffc145']}
                    orders={analysis.holdOrders}
                    categoryKey="region"
                  />
                </div>
              </div>

              <div className="chart-group">
                <PieChartCard
                  title="Stratification: Skip Orders (By Model)"
                  icon="bi-pie-chart-fill text-warning"
                  data={skipModelData}
                  emptyMessage="No skip orders to stratify."
                />
                <div className="mini-chart-grid">
                  <BarChartCard
                    title="Skip: Type"
                    icon="bi-bar-chart-line-fill text-primary"
                    labels={['Bus', 'Truck']}
                    values={skipTypeData}
                    colors={['#5f50cf', '#2ec4b6']}
                    orders={analysis.skipOrders}
                    categoryKey="vehicle_type"
                  />
                  {showWorkContent ? (
                    <BarChartCard
                      title="Skip: W/C"
                      icon="bi-bar-chart-steps text-primary"
                      labels={['HWC', 'LWC']}
                      values={skipWcData}
                      colors={['#ef476f', '#2a9d8f']}
                      orders={analysis.skipOrders}
                      categoryKey="work_content"
                    />
                  ) : null}
                  <BarChartCard
                    title="Skip: Reg."
                    icon="bi-globe-americas text-primary"
                    labels={['Domestic', 'Export']}
                    values={skipRegionData}
                    colors={['#3c91e6', '#ffc145']}
                    orders={analysis.skipOrders}
                    categoryKey="region"
                  />
                </div>
              </div>
            </section>

            <section className="panel-card mb-4">
              <div className="panel-card-header">
                <span>
                  <i className="bi bi-diagram-2-fill" /> Out-of-sequence anomaly blocks
                </span>
              </div>
              <div className="panel-card-body p-0">
                <div className="table-responsive">
                  <table className="table table-bordered table-hover mb-0 data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Break After Serial</th>
                        <th>Resumes At Serial</th>
                        <th>Out-of-sequence Range</th>
                        <th>Total in Block</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.gaps.length > 0 ? (
                        analysis.gaps.map((gap, index) => (
                          <tr key={`${gap.from_dsn}-${gap.to_dsn}-${index}`} className="gap-row">
                            <td>{index + 1}</td>
                            <td>
                              <code>{gap.from_dsn || 'N/A'}</code>
                            </td>
                            <td>
                              <code>{gap.to_dsn || 'N/A'}</code>
                            </td>
                            <td>
                              <span className="text-danger fw-semibold">{gap.skipped_range || ''}</span>
                            </td>
                            <td>
                              <span className="badge text-bg-danger">{gap.skipped_count || 0}</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="text-center text-secondary py-4">
                            No out-of-sequence blocks found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <ResultsTable
              title="Skip Orders"
              icon="bi-fast-forward-circle text-warning"
              badgeClassName="bg-warning text-dark"
              badgeValue={analysis.skipOrders.length}
              emptyMessage="No skip orders found."
              columns={skipTableColumns}
              rows={analysis.skipOrders}
              onDownload={downloadSkipOrders}
              reasonBucket={reasonConfig.skip}
              onGroupByChange={(groupBy) => updateReasonGroupBy('skip', groupBy)}
              onGroupSelect={(group) => updateReasonGroup('skip', group)}
              onGroupReasonChange={(group, reason) => updateGroupReason('skip', group, reason)}
              onGroupOutlookChange={(group, outlook) => updateGroupOutlook('skip', group, outlook)}
              onOrderReasonChange={(orderKey, reason) => updateOrderReason('skip', orderKey, reason)}
              onOrderOutlookChange={(orderKey, outlook) => updateOrderOutlook('skip', orderKey, outlook)}
            />

            <ResultsTable
              title="Hold Orders"
              icon="bi-pause-circle text-danger"
              badgeClassName="bg-danger"
              badgeValue={analysis.holdOrders.length}
              emptyMessage="No hold orders found."
              columns={holdTableColumns}
              rows={analysis.holdOrders}
              onDownload={downloadHoldOrders}
              reasonBucket={reasonConfig.hold}
              onGroupByChange={(groupBy) => updateReasonGroupBy('hold', groupBy)}
              onGroupSelect={(group) => updateReasonGroup('hold', group)}
              onGroupReasonChange={(group, reason) => updateGroupReason('hold', group, reason)}
              onGroupOutlookChange={(group, outlook) => updateGroupOutlook('hold', group, outlook)}
              onOrderReasonChange={(orderKey, reason) => updateOrderReason('hold', orderKey, reason)}
              onOrderOutlookChange={(orderKey, outlook) => updateOrderOutlook('hold', orderKey, outlook)}
            />

            <section className="panel-card mb-4">
              <div className="panel-card-header">
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <span>
                    <i className="bi bi-table text-primary" /> Data Preview
                  </span>
                  <small className="text-secondary">Showing all rows</small>
                </div>
                <div className="d-flex gap-2 align-items-center flex-wrap">
                  <button className="btn btn-sm btn-outline-primary fw-semibold" onClick={downloadPreview}>
                    <i className="bi bi-download me-1" />
                    Download CSV
                  </button>
                  <span className={`status-pill status-pill-${previewWithReasons.statusTone}`}>{previewWithReasons.statusLabel}</span>
                </div>
              </div>
              <div className="panel-card-body p-0">
                <div className="preview-table-wrap">
                  <table className="table table-bordered table-hover mb-0 data-table preview-table">
                    <thead>
                      <tr>
                        {previewColumns.map((column) => (
                          <th
                            key={column}
                            className={SEQUENCE_COLUMNS.includes(column) ? 'sequence-head' : ''}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deferredPreviewRows.map((row, rowIndex) => {
                        const shortageCount = getShortageCount(row)
                        return (
                          <tr key={`preview-${rowIndex}-${row['Serial Number'] || row.Serial || rowIndex}`} className={getPreviewRowClass(shortageCount)}>
                            {previewColumns.map((column) => {
                              const value = row[column] ?? ''
                              const className = [
                                getTableCellClass(column, value, shortageCount),
                                isBackToBackHwcCell(deferredPreviewRows, rowIndex, column, lineType) ? 'cell-hwc-back-to-back' : '',
                              ].filter(Boolean).join(' ')
                              return (
                                <td key={`${column}-${rowIndex}`} className={className}>
                                  {String(value)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="data-preview-actions">
                <div>
                  <strong>Day opening backup</strong>
                  <span>Save the mapped opening report, uploaded constraint files, and PDF summary.</span>
                </div>
                <button
                  className="btn btn-primary btn-sm fw-semibold"
                  type="button"
                  onClick={saveConstraintsBackup}
                  disabled={savingConstraints || !analyses.opening}
                >
                  {savingConstraints ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Saving
                    </>
                  ) : (
                    <>
                      <i className="bi bi-save me-1" />
                      Save Constraints
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="panel-card mb-4">
              <div className="panel-card-header">
                <span>
                  <i className="bi bi-clipboard2-data text-primary" /> AGGREGATE STATUS AGAINST DELIVERY
                </span>
                <small className="text-secondary">
                  {currentDayStatusSummary.currentDay
                    ? `${currentDayStatusSummary.currentDay} · ${currentDayStatusSummary.rowCount} scheduled rows`
                    : 'No scheduled production day available'}
                </small>
              </div>
              <div className="panel-card-body">
                {currentDayStatusSummary.shifts.length > 1 ? (
                  <div className="status-shift-groups">
                    {currentDayStatusSummary.shifts.map((shift) => (
                      <div className="status-shift-group" key={shift.label}>
                        <div className="status-shift-header">
                          <strong>{shift.label}</strong>
                          <span>{shift.rowCount} Vehicles in sequence</span>
                        </div>
                        <StatusSummaryGroup summary={shift} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <StatusSummaryGroup summary={currentDayStatusSummary} />
                )}
              </div>
            </section>

            {inferenceCards.length > 0 ? (
              <section className="mb-4">
                <h5 className="section-title">
                  <i className="bi bi-exclamation-triangle-fill text-danger me-2" />
                  Shortage impact analysis
                </h5>
                <div className="row g-3">
                  {inferenceCards.map((card) => (
                    <div key={card.part} className="col-lg-6">
                      <div className={`inference-card ${card.covered ? 'inference-covered' : ''}`}>
                        <h6>
                          {card.part}
                          {card.partName ? <span>{card.partName}</span> : null}
                        </h6>
                        {card.covered ? (
                          <>
                            <p className="text-success fw-semibold mb-0">
                              <i className="bi bi-check-circle-fill me-1" />
                              Stock completely covers the current production sequence.
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="inference-grid">
                              <div>
                                <span className="detail-label">First Shortage Date</span>
                                <strong>{card.shortageDate}</strong>
                              </div>
                              <div>
                                <span className="detail-label">Time of Impact</span>
                                <strong>{card.impactTime}</strong>
                              </div>
                              <div>
                                <span className="detail-label">Sequence Numbers</span>
                                <strong>{card.firstDaySequences}</strong>
                              </div>
                              <div className="full-span">
                                <span className="detail-label">Connecting Models</span>
                                <strong>{card.connectingModels}</strong>
                              </div>
                            </div>

                            <span className="detail-label mb-2 d-inline-block">Day-wise requirements (next 4 production days)</span>
                            <table className="table table-sm table-bordered mb-0 inference-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th className="text-end">Day Plan</th>
                                  <th className="text-end">Shortage Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {card.unscheduled ? (
                                  <tr>
                                    <td colSpan="3" className="text-center text-secondary py-3">
                                      Impacted vehicles are on hold or not scheduled.
                                    </td>
                                  </tr>
                                ) : (
                                  card.forecast.map((entry) => (
                                    <tr key={`${card.part}-${entry.date}`}>
                                      <td>{entry.date}</td>
                                      <td className="text-end fw-semibold">{entry.dayPlan}</td>
                                      <td className="text-end fw-semibold text-danger">{entry.shortageQty}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
              </>
            )}
          </div>
        ) : null}
      </main>
      )}
    </div>
  )
}

export default App
