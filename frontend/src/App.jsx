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
const ANALYTICS_VIEW_TYPES = {
  ...REPORT_TYPES,
  plan: PLAN_REPORT_TYPE,
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

function triggerDownload(fileName, columns, rows) {
  const csv = [
    columns.map(escapeCsvValue).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')),
  ].join('\n')
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

const DAY_SHIFT_BREAKS = [
  { start: 9 * 60 + 30, end: 9 * 60 + 37 },
  { start: 11 * 60 + 30, end: 12 * 60 },
  { start: 14 * 60 + 30, end: 14 * 60 + 37 },
]
const THURSDAY_PLANNED_STOP = { start: 8 * 60 + 30, end: 9 * 60 + 30 }
const HDT_EXTENDED_SHIFT_BREAKS = [
  ...DAY_SHIFT_BREAKS,
  { start: 18 * 60 + 30, end: 18 * 60 + 37 },
  { start: 20 * 60 + 30, end: 21 * 60 },
  { start: 24 * 60, end: 24 * 60 + 7 },
]

function createShiftTime(productionDate, minutesFromMidnight) {
  const date = new Date(productionDate)
  date.setHours(0, 0, 0, 0)
  date.setMinutes(minutesFromMidnight)
  return date
}

function getShiftStartTime(productionDate) {
  return createShiftTime(productionDate, 7 * 60)
}

function getShiftEndTime(productionDate, lineType) {
  const lineConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT
  return createShiftTime(productionDate, lineConfig.shiftEndMinute)
}

function getProductionDateFromTimestamp(timestamp, lineType) {
  const uploadTime = new Date(timestamp)
  if (Number.isNaN(uploadTime.getTime())) {
    return null
  }

  const productionDate = new Date(uploadTime)
  productionDate.setHours(0, 0, 0, 0)
  const minutesFromMidnight = uploadTime.getHours() * 60 + uploadTime.getMinutes()
  const lineConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT

  if (lineConfig.shiftEndMinute > 24 * 60 && minutesFromMidnight < lineConfig.shiftEndMinute - 24 * 60) {
    productionDate.setDate(productionDate.getDate() - 1)
  }

  return productionDate
}

function getModStartTime(uploadedAt, holidays, lineType) {
  const uploadTime = new Date(uploadedAt)
  if (Number.isNaN(uploadTime.getTime())) {
    return null
  }

  let productionDate = getProductionDateFromTimestamp(uploadTime, lineType)
  if (!productionDate) {
    return null
  }

  let currentTime = new Date(uploadTime)
  let shiftStart = getShiftStartTime(productionDate)
  let shiftEnd = getShiftEndTime(productionDate, lineType)

  if (currentTime < shiftStart) {
    currentTime = new Date(shiftStart)
  }

  if (currentTime >= shiftEnd) {
    productionDate.setDate(productionDate.getDate() + 1)
    productionDate = getNextWorkingDay(productionDate, holidays)
    shiftStart = getShiftStartTime(productionDate)
    shiftEnd = getShiftEndTime(productionDate, lineType)
    currentTime = new Date(shiftStart)
  }

  currentTime = skipProductionBreaks(currentTime, productionDate, lineType)
  if (currentTime >= shiftEnd) {
    productionDate.setDate(productionDate.getDate() + 1)
    productionDate = getNextWorkingDay(productionDate, holidays)
    currentTime = getShiftStartTime(productionDate)
  }

  return { productionDate, currentTime }
}

function getBreakWindows(productionDate, lineType) {
  const baseBreaks = lineType === 'MDT' ? DAY_SHIFT_BREAKS : HDT_EXTENDED_SHIFT_BREAKS
  const breaks = productionDate.getDay() === 4
    ? [...baseBreaks, THURSDAY_PLANNED_STOP].sort((a, b) => a.start - b.start)
    : baseBreaks

  return breaks.map((breakWindow) => ({
    start: createShiftTime(productionDate, breakWindow.start),
    end: createShiftTime(productionDate, breakWindow.end),
  }))
}

function skipProductionBreaks(date, productionDate, lineType) {
  let adjustedDate = new Date(date)
  let moved = true

  while (moved) {
    moved = false
    for (const breakWindow of getBreakWindows(productionDate, lineType)) {
      if (adjustedDate >= breakWindow.start && adjustedDate < breakWindow.end) {
        adjustedDate = new Date(breakWindow.end)
        moved = true
        break
      }
    }
  }

  return adjustedDate
}

function addProductionMinutes(date, minutes, productionDate, lineType) {
  let currentTime = skipProductionBreaks(date, productionDate, lineType)
  let remainingMinutes = minutes

  while (remainingMinutes > 0) {
    const nextBreak = getBreakWindows(productionDate, lineType).find((breakWindow) => currentTime < breakWindow.end)
    if (!nextBreak) {
      return new Date(currentTime.getTime() + remainingMinutes * 60000)
    }

    if (currentTime >= nextBreak.start) {
      currentTime = new Date(nextBreak.end)
      continue
    }

    const minutesUntilBreak = (nextBreak.start.getTime() - currentTime.getTime()) / 60000
    if (remainingMinutes <= minutesUntilBreak) {
      return skipProductionBreaks(new Date(currentTime.getTime() + remainingMinutes * 60000), productionDate, lineType)
    }

    remainingMinutes -= minutesUntilBreak
    currentTime = new Date(nextBreak.end)
  }

  return skipProductionBreaks(currentTime, productionDate, lineType)
}

function applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType = 'HDT', baselineRows = []) {
  const lineConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT
  const [year, month, day] = startDate.split('-').map((value) => Number.parseInt(value, 10))
  let currentDate = getNextWorkingDay(new Date(year, month - 1, day), holidays)
  let releaseStarted = false
  let releaseCounter = 1
  let todayCapacity = baseCapacity
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
      todayCapacity =
        currentDate.getDay() === 4
          ? Math.floor(baseCapacity * (lineConfig.thursdayMinutes / lineConfig.standardMinutes))
          : baseCapacity
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
  const lineConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT
  const standardTotalMinutes = lineConfig.standardMinutes
  const thursdayTotalMinutes = lineConfig.thursdayMinutes
  const baseline = buildSequenceBaseline(baselineRows)
  let counter = 1
  let sequenceStarted = false
  let currentDayMinutes = standardTotalMinutes
  let todayCapacity = baseCapacity
  let taktTime = currentDayMinutes / todayCapacity
  let currentTime = new Date(currentDate)
  currentTime.setHours(7, 0, 0, 0)

  if (baseline.size > 0 && modUploadedAt) {
    const firstTrimIndex = rows.findIndex((row) => {
      const status = String(row.Status ?? '').trim().toUpperCase()
      return status === 'TRIM LINE' && !modSkipKeys.has(getPreviewVehicleKey(row))
    })
    const modStart = getModStartTime(modUploadedAt, holidays, lineType)
    const anchoredSequence = Number.parseInt(modStartSequence, 10)

    rows.forEach((row) => {
      row['Line in sequence'] = ''
      row['Production Date'] = ''
      row['Line in time'] = ''
      row[RELEASE_SEQUENCE_COLUMN] = ''
    })

    if (firstTrimIndex === -1 || !modStart || !Number.isFinite(anchoredSequence) || anchoredSequence <= 0) {
      applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType, baselineRows)
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
      currentDayMinutes = currentDate.getDay() === 4 ? thursdayTotalMinutes : standardTotalMinutes
      todayCapacity =
        currentDate.getDay() === 4
          ? Math.floor(baseCapacity * (thursdayTotalMinutes / standardTotalMinutes))
          : baseCapacity
      taktTime = currentDayMinutes / todayCapacity

      if (!isModStartDay && counter > todayCapacity) {
        counter = 1
        currentDate.setDate(currentDate.getDate() + 1)
        currentDate = getNextWorkingDay(currentDate, holidays)
        currentTime = getShiftStartTime(currentDate)
        currentDayMinutes = currentDate.getDay() === 4 ? thursdayTotalMinutes : standardTotalMinutes
        todayCapacity =
          currentDate.getDay() === 4
            ? Math.floor(baseCapacity * (thursdayTotalMinutes / standardTotalMinutes))
            : baseCapacity
        taktTime = currentDayMinutes / todayCapacity
      }

      let shiftEnd = getShiftEndTime(currentDate, lineType)
      currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType)
      if (currentTime > shiftEnd) {
        counter = 1
        currentDate.setDate(currentDate.getDate() + 1)
        currentDate = getNextWorkingDay(currentDate, holidays)
        currentTime = getShiftStartTime(currentDate)
        currentDayMinutes = currentDate.getDay() === 4 ? thursdayTotalMinutes : standardTotalMinutes
        todayCapacity =
          currentDate.getDay() === 4
            ? Math.floor(baseCapacity * (thursdayTotalMinutes / standardTotalMinutes))
            : baseCapacity
        taktTime = currentDayMinutes / todayCapacity
        currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType)
        shiftEnd = getShiftEndTime(currentDate, lineType)
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
        currentTime = getShiftStartTime(currentDate)
        isModStartDay = false
      }
    }

    applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType, baselineRows)

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
      currentDayMinutes = currentDate.getDay() === 4 ? thursdayTotalMinutes : standardTotalMinutes
      todayCapacity =
        currentDate.getDay() === 4
          ? Math.floor(baseCapacity * (thursdayTotalMinutes / standardTotalMinutes))
          : baseCapacity
      taktTime = currentDayMinutes / todayCapacity

      currentTime = new Date(currentDate)
      currentTime.setHours(7, 0, 0, 0)
    }

    currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType)
    if (currentTime > getShiftEndTime(currentDate, lineType)) {
      counter = 1
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate = getNextWorkingDay(currentDate, holidays)
      currentDayMinutes = currentDate.getDay() === 4 ? thursdayTotalMinutes : standardTotalMinutes
      todayCapacity =
        currentDate.getDay() === 4
          ? Math.floor(baseCapacity * (thursdayTotalMinutes / standardTotalMinutes))
          : baseCapacity
      taktTime = currentDayMinutes / todayCapacity
      currentTime = addProductionMinutes(getShiftStartTime(currentDate), taktTime, currentDate, lineType)
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

  applyReleaseSequence(rows, baseCapacity, startDate, holidays, lineType)

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

  return ''
}

const ENGINE_FG_SUMMARY_STATUSES = new Set([
  'FG',
  'BOOKED NOT YET STORED',
  'RETRIEVAL TRIGGER RECEIVED',
])
const HDT_A_SHIFT_END_MINUTE = 16 * 60 + 45

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
  }
}

function buildCurrentDayStatusSummary(rows = [], lineType = 'HDT') {
  const currentDay = rows.find((row) => normalizeLookupValue(row?.['Production Date']))?.['Production Date'] ?? ''
  const dayRows = currentDay
    ? rows.filter((row) => normalizeLookupValue(row?.['Production Date']) === String(currentDay))
    : []
  const aShiftRows = lineType === 'HDT'
    ? dayRows.filter((row) => {
        const lineMinute = getLineTimeMinute(row?.['Line in time'])
        return lineMinute !== null && lineMinute < HDT_A_SHIFT_END_MINUTE
      })
    : []
  const bShiftRows = lineType === 'HDT'
    ? dayRows.filter((row) => {
        const lineMinute = getLineTimeMinute(row?.['Line in time'])
        return lineMinute !== null && lineMinute >= HDT_A_SHIFT_END_MINUTE
      })
    : []

  return {
    currentDay,
    rowCount: dayRows.length,
    engine: buildStatusCounts(dayRows, 'Engine status'),
    transmission: buildStatusCounts(dayRows, 'Transmission status'),
    axle: buildStatusCounts(dayRows, 'Axle status'),
    shifts: lineType === 'HDT'
      ? [
          buildShiftStatusSummary('A shift', aShiftRows),
          buildShiftStatusSummary('B shift', bShiftRows),
        ]
      : [],
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
    <div className="col-lg-6">
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
    </div>
  )
}

function BarChartCard({ title, icon, labels, values, colors, orders, categoryKey }) {
  const hasData = Math.max(...values, 0) > 0
  return (
    <div className="col-sm-6 col-md-4 col-lg-2">
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

function buildPlanSummary(rows = [], openingColumns = []) {
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

  return {
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
          <div className="plan-summary-grid">
            <div className="plan-summary-card">
              <h6>BUS orders</h6>
              <strong>{summary.bus.total}</strong>
              <CountList counts={summary.bus.modelCounts} />
              <p>Podest opening FG: <b>{summary.bus.podestOpeningFg}</b></p>
            </div>
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

function App() {
  const fileInputId = useId()
  const shortageBatchInputId = useId()
  const shortageIntro =
    'Upload variant Excel files, confirm the derived part number, and provide part name, reference order, and quantity for each shortage.'
  const [reportFiles, setReportFiles] = useState({ opening: null, mod: null })
  const [reportUploadedAt, setReportUploadedAt] = useState({ opening: null, mod: null })
  const [modStartSequence, setModStartSequence] = useState('')
  const [engineStatusFile, setEngineStatusFile] = useState(null)
  const [axleStatusFile, setAxleStatusFile] = useState(null)
  const [dragActiveReport, setDragActiveReport] = useState(null)
  const [capacity, setCapacity] = useState('')
  const [startDate, setStartDate] = useState('')
  const [lineType] = useState(getInitialLineType)
  const [holidayInput, setHolidayInput] = useState('')
  const [holidays, setHolidays] = useState([])
  const [shortages, setShortages] = useState([createShortageRow()])
  const [analyses, setAnalyses] = useState({ opening: null, mod: null })
  const [activeReport, setActiveReport] = useState('opening')
  const [reasonConfig, setReasonConfig] = useState(createReasonState)
  const [showLanding, setShowLanding] = useState(getInitialLandingState)
  const [loading, setLoading] = useState(false)
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
  const availableReportViews = lineType === 'HDT' && analyses.opening
    ? [...availableReports, 'plan']
    : availableReports
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
  const deferredPreviewRows = useDeferredValue(previewWithReasons.rows)
  const currentDayStatusSummary = buildCurrentDayStatusSummary(previewWithReasons.rows, lineType)
  const planSummary = buildPlanSummary(openingSequencedPreview.rows, analyses.opening?.previewColumns ?? [])
  const inferenceCards = buildInference(sequencedPreview.rows, analysis?.summary?.shortage_parts ?? [], shortagePartNames)

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
          setEngineStatusFile(workspace.engineStatusFile ?? null)
          setAxleStatusFile(workspace.axleStatusFile ?? null)
          setCapacity(workspace.capacity ?? '')
          setStartDate(workspace.startDate ?? '')
          setHolidayInput(workspace.holidayInput ?? '')
          setHolidays(Array.isArray(workspace.holidays) ? workspace.holidays : [])
          setShortages(Array.isArray(workspace.shortages) && workspace.shortages.length ? workspace.shortages : [createShortageRow()])
          setAnalyses(workspace.analyses ?? { opening: null, mod: null })
          setActiveReport(workspace.activeReport ?? 'opening')
          setReasonConfig(workspace.reasonConfig ?? createReasonState())
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
        engineStatusFile,
        axleStatusFile,
        capacity,
        startDate,
        holidayInput,
        holidays,
        shortages,
        analyses,
        activeReport,
        reasonConfig,
        savedAt: new Date().toISOString(),
      }).catch(() => {
        pushToast('Workspace could not be saved in this browser.', 'warning')
      })
    }, 500)

    return () => {
      window.clearTimeout(workspaceSaveTimerRef.current)
    }
  }, [lineType, reportFiles, reportUploadedAt, modStartSequence, engineStatusFile, axleStatusFile, capacity, startDate, holidayInput, holidays, shortages, analyses, activeReport, reasonConfig])

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

  function resetAll() {
    clearWorkspace(lineType).catch(() => {
      pushToast('Saved workspace could not be cleared in this browser.', 'warning')
    })
    setReportFiles({ opening: null, mod: null })
    setReportUploadedAt({ opening: null, mod: null })
    setModStartSequence('')
    setEngineStatusFile(null)
    setAxleStatusFile(null)
    setDragActiveReport(null)
    setCapacity('')
    setStartDate('')
    setHolidayInput('')
    setHolidays([])
    setShortages([createShortageRow()])
    setAnalyses({ opening: null, mod: null })
    setActiveReport('opening')
    setReasonConfig(createReasonState())
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
    triggerDownload('Sequenced_Production_Report.csv', previewWithReasons.columns, previewWithReasons.rows)
  }

  function downloadHoldOrders() {
    if (!analysis?.holdOrders?.length) {
      pushToast('No hold orders available to download.', 'warning')
      return
    }
    triggerDownload('Hold_Orders.csv', HOLD_EXPORT_COLUMNS, analysis.holdOrders)
  }

  function downloadSkipOrders() {
    if (!analysis?.skipOrders?.length) {
      pushToast('No skip orders available to download.', 'warning')
      return
    }
    triggerDownload('Skip_Orders.csv', SKIP_EXPORT_COLUMNS, analysis.skipOrders)
  }

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
          <div className="hero-title-block">
            <h1>Production Planning and Control</h1>
            <p>{LINE_TYPES[lineType].title} Sequence Analyser</p>
          </div>
        </div>
      </header>

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
                    Takt time: <strong>{sequencedPreview.taktTime ? `${sequencedPreview.taktTime} min` : 'Pending'}</strong>
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
                          <span className="upload-copy">{report.copy}</span>
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
                      <span className="upload-copy">Column C to J/L status.</span>
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
                      <span className="upload-copy">Column B to E color status.</span>
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

            {activeReport === 'plan' ? (
              <PlanSummaryView summary={planSummary} columns={openingSequencedPreview.columns} />
            ) : (
              <>
            <section className="row g-3 mb-4 mt-1">
              <StatCard label="PBS HOLD" value={analysis.summary.total_hold || 0} tone="hold" icon="bi-pause-circle" />
              <StatCard
                label="Total Skip Orders"
                value={analysis.summary.total_skipped || 0}
                tone="skip"
                icon="bi-fast-forward-circle"
              />
            </section>

            <section className="row g-4 mb-4">
              <PieChartCard
                title="Stratification: Hold Orders (By Model)"
                icon="bi-pie-chart-fill text-danger"
                data={holdModelData}
                emptyMessage="No hold orders to stratify."
              />
              <PieChartCard
                title="Stratification: Skip Orders (By Model)"
                icon="bi-pie-chart-fill text-warning"
                data={skipModelData}
                emptyMessage="No skip orders to stratify."
              />
            </section>

            <section className="row g-3 mb-4">
              <BarChartCard
                title="Hold: Type"
                icon="bi-bar-chart-line-fill text-primary"
                labels={['Bus', 'Truck']}
                values={holdTypeData}
                colors={['#5f50cf', '#2ec4b6']}
                orders={analysis.holdOrders}
                categoryKey="vehicle_type"
              />
              <BarChartCard
                title="Hold: W/C"
                icon="bi-bar-chart-steps text-primary"
                labels={['HWC', 'LWC']}
                values={holdWcData}
                colors={['#ef476f', '#2a9d8f']}
                orders={analysis.holdOrders}
                categoryKey="work_content"
              />
              <BarChartCard
                title="Hold: Reg."
                icon="bi-globe-americas text-primary"
                labels={['Domestic', 'Export']}
                values={holdRegionData}
                colors={['#3c91e6', '#ffc145']}
                orders={analysis.holdOrders}
                categoryKey="region"
              />
              <BarChartCard
                title="Skip: Type"
                icon="bi-bar-chart-line-fill text-primary"
                labels={['Bus', 'Truck']}
                values={skipTypeData}
                colors={['#5f50cf', '#2ec4b6']}
                orders={analysis.skipOrders}
                categoryKey="vehicle_type"
              />
              <BarChartCard
                title="Skip: W/C"
                icon="bi-bar-chart-steps text-primary"
                labels={['HWC', 'LWC']}
                values={skipWcData}
                colors={['#ef476f', '#2a9d8f']}
                orders={analysis.skipOrders}
                categoryKey="work_content"
              />
              <BarChartCard
                title="Skip: Reg."
                icon="bi-globe-americas text-primary"
                labels={['Domestic', 'Export']}
                values={skipRegionData}
                colors={['#3c91e6', '#ffc145']}
                orders={analysis.skipOrders}
                categoryKey="region"
              />
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
              columns={SKIP_TABLE_COLUMNS}
              rows={analysis.skipOrders}
              onDownload={downloadSkipOrders}
              fileNameHint="TRIM LINE vehicles trapped in out-of-sequence blocks"
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
              columns={HOLD_TABLE_COLUMNS}
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
                        {previewWithReasons.columns.map((column) => (
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
                            {previewWithReasons.columns.map((column) => {
                              const value = row[column] ?? ''
                              const className = getTableCellClass(column, value, shortageCount)
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
                {lineType === 'HDT' ? (
                  <div className="status-shift-groups">
                    {currentDayStatusSummary.shifts.map((shift) => (
                      <div className="status-shift-group" key={shift.label}>
                        <div className="status-shift-header">
                          <strong>{shift.label}</strong>
                          <span>{shift.rowCount} Vehicles in sequence</span>
                        </div>
                        <div className="status-summary-grid">
                          <StatusSummaryTable
                            title="Engine status"
                            column="Engine status"
                            rows={shift.engine}
                          />
                          <StatusSummaryTable
                            title="Transmission status"
                            column="Transmission status"
                            rows={shift.transmission}
                          />
                          <StatusSummaryTable
                            title="Axle status"
                            column="Axle status"
                            rows={shift.axle}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="status-summary-grid">
                    <StatusSummaryTable
                      title="Engine status"
                      column="Engine status"
                      rows={currentDayStatusSummary.engine}
                    />
                    <StatusSummaryTable
                      title="Transmission status"
                      column="Transmission status"
                      rows={currentDayStatusSummary.transmission}
                    />
                    <StatusSummaryTable
                      title="Axle status"
                      column="Axle status"
                      rows={currentDayStatusSummary.axle}
                    />
                  </div>
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
    </div>
  )
}

export default App
