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
const LANDING_IMAGE_URL = 'https://www.bharatbenz.com/uploads/homebanner_images/large/BB-Construction.jpg'
const LINE_TYPES = {
  HDT: {
    title: 'HDT',
    description: 'Heavy-duty truck sequence timing',
    standardMinutes: 1070,
    thursdayMinutes: 1010,
  },
  MDT: {
    title: 'MDT',
    description: 'Medium-duty truck single-shift timing',
    standardMinutes: 541,
    thursdayMinutes: 541,
  },
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
  return fileName.replace(/\.[^/.]+$/, '').trim()
}

function createShortageRow(file = null) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    part: file ? getPartNumberFromFileName(file.name) : '',
    partName: '',
    ref: '',
    qty: '',
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
  const state = normalizeLookupKey(getPreviewValue(row, ['Vehicle Order State', 'VEHICLE ORDER STATE', 'State', 'state']))
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
  const state = normalizeLookupKey(getPreviewValue(row, ['Vehicle Order State', 'VEHICLE ORDER STATE', 'State', 'state']))
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

function applySkipHoldReasons(sequencedPreview, analysis, reasonConfig) {
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
  const rows = sequencedPreview.rows.map((row) => ({
    ...row,
    [REASON_COLUMN]: getPreviewReason(row, reasonConfig, lookups),
    [OUTLOOK_COLUMN]: formatOutlookValue(getPreviewOutlook(row, reasonConfig, lookups)),
  }))

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

function getBreakWindows(productionDate, lineType) {
  const breaks = lineType === 'MDT' ? DAY_SHIFT_BREAKS : HDT_EXTENDED_SHIFT_BREAKS
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

function applySequence(previewColumns, previewData, capacityValue, startDate, holidays, lineType = 'HDT') {
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
  const sequenceColumns = ['Line in sequence', 'Production Date', 'Line in time']
  const columns = [...previewColumns]
  const statusIndex = columns.indexOf('Status')

  if (statusIndex === -1) {
    columns.unshift(...sequenceColumns)
  } else {
    columns.splice(statusIndex + 1, 0, ...sequenceColumns)
  }

  const rows = structuredClone(previewData)
  const lineConfig = LINE_TYPES[lineType] ?? LINE_TYPES.HDT
  const standardTotalMinutes = lineConfig.standardMinutes
  const thursdayTotalMinutes = lineConfig.thursdayMinutes
  let counter = 1
  let sequenceStarted = false
  let currentDayMinutes = standardTotalMinutes
  let todayCapacity = baseCapacity
  let taktTime = currentDayMinutes / todayCapacity
  let currentTime = new Date(currentDate)
  currentTime.setHours(7, 0, 0, 0)

  for (const row of rows) {
    const status = String(row.Status ?? '').trim().toUpperCase()
    if (!sequenceStarted && status === 'TRIM LINE') {
      sequenceStarted = true
    }

    if (!sequenceStarted) {
      row['Line in sequence'] = ''
      row['Production Date'] = ''
      row['Line in time'] = ''
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

    currentTime = skipProductionBreaks(currentTime, currentDate, lineType)
    row['Line in sequence'] = counter
    row['Production Date'] = formatDateKey(currentDate)
    row['Line in time'] = formatLineTime(currentTime)

    currentTime = addProductionMinutes(currentTime, taktTime, currentDate, lineType)

    counter += 1
    if (counter > todayCapacity) {
      counter = 1
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate = getNextWorkingDay(currentDate, holidays)
    }
  }

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

function getTableCellClass(column, value, shortageCount) {
  if (SHORTAGE_MARKERS.has(String(value))) {
    return 'cell-shortage'
  }
  if (value === 'Covered') {
    return 'cell-covered'
  }
  if (
    ['Line in sequence', 'Production Date', 'Line in time'].includes(column) &&
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
                    labels: { boxWidth: 14, font: { size: 12, weight: 'bold' } },
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

function App() {
  const fileInputId = useId()
  const shortageBatchInputId = useId()
  const shortageIntro =
    'Upload variant Excel files, confirm the derived part number, and provide part name, reference order, and quantity for each shortage.'
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [capacity, setCapacity] = useState('')
  const [startDate, setStartDate] = useState('')
  const [lineType, setLineType] = useState('HDT')
  const [holidayInput, setHolidayInput] = useState('')
  const [holidays, setHolidays] = useState([])
  const [shortages, setShortages] = useState([createShortageRow()])
  const [analysis, setAnalysis] = useState(null)
  const [reasonConfig, setReasonConfig] = useState(createReasonState)
  const [showLanding, setShowLanding] = useState(true)
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const resultsRef = useRef(null)
  const toastCounterRef = useRef(0)
  const shortagePartNames = shortages.reduce((partNames, shortage) => {
    const part = shortage.part.trim()
    const partName = shortage.partName.trim()
    if (part) {
      partNames[part] = partName
      partNames[normalizePartKey(part)] = partName
    }
    return partNames
  }, {})

  const sequencedPreview = applySequence(
    analysis?.previewColumns ?? [],
    analysis?.previewData ?? [],
    capacity,
    startDate,
    holidays,
    lineType,
  )
  const previewWithReasons = applySkipHoldReasons(sequencedPreview, analysis, reasonConfig)
  const deferredPreviewRows = useDeferredValue(previewWithReasons.rows)
  const inferenceCards = buildInference(sequencedPreview.rows, analysis?.summary?.shortage_parts ?? [], shortagePartNames)

  useEffect(() => {
    if (!analysis || !resultsRef.current) {
      return
    }
    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [analysis])

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
    setSelectedFile(null)
    setDragActive(false)
    setCapacity('')
    setStartDate('')
    setLineType('HDT')
    setHolidayInput('')
    setHolidays([])
    setShortages([createShortageRow()])
    setAnalysis(null)
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

  async function runAnalysis() {
    if (!selectedFile) {
      pushToast('Action blocked: please upload a main report file.', 'warning')
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', selectedFile)

    for (const shortage of shortages) {
      if (shortage.part.trim() && shortage.file) {
        formData.append('shortage_parts', shortage.part.trim())
        formData.append('shortage_refs', shortage.ref.trim())
        formData.append('shortage_qtys', shortage.qty.toString().trim())
        formData.append('shortage_files', shortage.file)
      }
    }

    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: formData })
      const raw = await response.json()
      if (!response.ok || raw.error) {
        throw new Error(raw.error || 'Server returned an unexpected error.')
      }

      startTransition(() => {
        setAnalysis(normalizeData(raw))
        setReasonConfig(createReasonState())
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
        <div className="hero-symbol">
          <i className="bi bi-diagram-3-fill" />
        </div>
        <div>
          <p className="hero-kicker">Sequence intelligence workspace</p>
          <h1>Sequence &amp; Skip Order Analyzer</h1>
          <p className="hero-copy">
            React frontend with the existing Flask impact engine behind it. Upload the production report, layer in shortage
            mapping, and inspect the affected vehicles in one flow.
          </p>
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
              <button
                key={type}
                type="button"
                className={`line-type-button ${lineType === type ? 'active' : ''}`}
                onClick={() => setLineType(type)}
                aria-pressed={lineType === type}
              >
                {type}
              </button>
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
                      <div className="col-sm-4">
                        <label className="form-label small fw-semibold">Qty</label>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          value={shortage.qty}
                          onChange={(event) => updateShortage(shortage.id, { qty: event.target.value })}
                        />
                      </div>
                      <div className="col-sm-8">
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
                  <i className="bi bi-3-circle-fill" /> Step 3: Upload report
                </span>
              </div>
              <div className="step-body d-flex flex-column">
                <label
                  htmlFor={fileInputId}
                  className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragActive(false)
                    const file = event.dataTransfer.files?.[0]
                    if (file) {
                      setSelectedFile(file)
                    }
                  }}
                >
                  <i className="bi bi-file-earmark-spreadsheet upload-icon" />
                  <span className="upload-title">Drop the main sequence report here</span>
                  <span className="upload-copy">or click to browse `.xlsx`, `.xls`, or `.csv` files</span>
                  <strong className="upload-file">{selectedFile?.name || 'No file selected'}</strong>
                </label>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="d-none"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />

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

                <div className="upload-hint">
                  Backend target: <code>/api/analyze</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {analysis ? (
          <div ref={resultsRef} className="results-shell">
            <section className="row g-3 mb-4 mt-1">
              <StatCard label="Total Hold Orders" value={analysis.summary.total_hold || 0} tone="hold" icon="bi-pause-circle" />
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
                            className={['Line in sequence', 'Production Date', 'Line in time'].includes(column) ? 'sequence-head' : ''}
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
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
