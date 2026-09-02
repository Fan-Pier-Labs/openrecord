import { describe, it, expect } from 'bun:test'
import {
  annotateComponentResultInfo,
  annotateHistoricalResults,
  annotateLabTestResult,
  deriveFlagFromRange,
  normalizeReportedFlag,
} from '../labs/abnormalFlags'
import type { ComponentResultInfo, HistoricalResultsResponse, LabTestResult, ReferenceRange } from '../labs/labtestresulttype'

function range(partial: Partial<ReferenceRange> = {}): ReferenceRange {
  return { displayLow: '', displayHigh: '', formattedReferenceRange: '', ...partial }
}

function component(partial: Partial<ComponentResultInfo> = {}): ComponentResultInfo {
  return {
    value: '',
    isValueRtf: false,
    referenceRange: range(),
    abnormalFlagCategoryValue: 'Unknown',
    ...partial,
  }
}

describe('normalizeReportedFlag', () => {
  it('maps the category names and the raw HL7 codes an instance may send', () => {
    expect(normalizeReportedFlag('High')).toBe('high')
    expect(normalizeReportedFlag('Abnormal High')).toBe('high')
    expect(normalizeReportedFlag('H')).toBe('high')
    expect(normalizeReportedFlag('low')).toBe('low')
    expect(normalizeReportedFlag('CriticalLow')).toBe('criticalLow')
    expect(normalizeReportedFlag('HH')).toBe('criticalHigh')
    expect(normalizeReportedFlag('Normal')).toBe('normal')
    expect(normalizeReportedFlag('Abnormal')).toBe('abnormal')
  })

  it('treats every "the instance said nothing" spelling as unreported', () => {
    for (const raw of ['Unknown', 'None', '', '   ', 0, 7, null, undefined]) {
      expect(normalizeReportedFlag(raw)).toBeNull()
    }
  })
})

describe('deriveFlagFromRange', () => {
  it('compares the numeric value against the stated bounds', () => {
    const r = range({ low: 0, high: 100 })
    expect(deriveFlagFromRange(component({ numericValue: 190, referenceRange: r }))).toBe('high')
    expect(deriveFlagFromRange(component({ numericValue: 50, referenceRange: r }))).toBe('normal')
    expect(deriveFlagFromRange(component({ numericValue: -1, referenceRange: r }))).toBe('low')
  })

  it('calls a value sitting exactly on an inclusive bound normal, and an exclusive one out of range', () => {
    const inclusive = range({ low: 40, high: 60 })
    expect(deriveFlagFromRange(component({ numericValue: 40, referenceRange: inclusive }))).toBe('normal')
    expect(deriveFlagFromRange(component({ numericValue: 60, referenceRange: inclusive }))).toBe('normal')

    const exclusive = range({ low: 40, high: 60, lowerBoundExclusive: true, upperBoundExclusive: true })
    expect(deriveFlagFromRange(component({ numericValue: 40, referenceRange: exclusive }))).toBe('low')
    expect(deriveFlagFromRange(component({ numericValue: 60, referenceRange: exclusive }))).toBe('high')
  })

  it('judges a one-sided range on the bound it has', () => {
    expect(deriveFlagFromRange(component({ numericValue: 250, referenceRange: range({ high: 200 }) }))).toBe('high')
    expect(deriveFlagFromRange(component({ numericValue: 10, referenceRange: range({ high: 200 }) }))).toBe('normal')
    expect(deriveFlagFromRange(component({ numericValue: 10, referenceRange: range({ low: 40 }) }))).toBe('low')
  })

  it('falls back to the value string and the display bounds when the numbers are missing', () => {
    const info = component({ value: '190', referenceRange: range({ displayLow: '0', displayHigh: '100' }) })
    expect(deriveFlagFromRange(info)).toBe('high')
  })

  it('refuses to guess without a number on both sides', () => {
    // A qualitative result, a censored value, and a range that is prose.
    expect(deriveFlagFromRange(component({ value: 'NEGATIVE', referenceRange: range({ low: 0, high: 1 }) }))).toBeNull()
    expect(deriveFlagFromRange(component({ value: '<0.01', referenceRange: range({ low: 0, high: 1 }) }))).toBeNull()
    expect(deriveFlagFromRange(component({ numericValue: 5, referenceRange: range({ displayHigh: 'Negative' }) }))).toBeNull()
    expect(deriveFlagFromRange(component({ numericValue: 5, referenceRange: range() }))).toBeNull()
  })
})

describe('annotateComponentResultInfo', () => {
  it('derives the flag when the instance only says "Unknown", keeping the raw value', () => {
    const info = component({ value: '190', numericValue: 190, referenceRange: range({ low: 0, high: 100 }) })
    annotateComponentResultInfo(info)

    expect(info.abnormalFlag).toBe('high')
    expect(info.isAbnormal).toBe(true)
    expect(info.abnormalFlagSource).toBe('derived')
    expect(info.abnormalFlagCategoryValue).toBe('Unknown')
  })

  it('prefers what the instance reported over the reference range', () => {
    // A lab can flag a value its own printed range would call normal.
    const info = component({
      value: '99',
      numericValue: 99,
      referenceRange: range({ low: 0, high: 100 }),
      abnormalFlagCategoryValue: 'High',
    })
    annotateComponentResultInfo(info)

    expect(info.abnormalFlag).toBe('high')
    expect(info.abnormalFlagSource).toBe('reported')
  })

  it('marks a normal component normal rather than leaving it undecided', () => {
    const info = component({ value: '50', numericValue: 50, referenceRange: range({ low: 0, high: 100 }) })
    annotateComponentResultInfo(info)

    expect(info.abnormalFlag).toBe('normal')
    expect(info.isAbnormal).toBe(false)
  })

  it('leaves all three fields absent when neither source can answer', () => {
    const info = component({ value: 'NEGATIVE' })
    annotateComponentResultInfo(info)

    expect(info.abnormalFlag).toBeUndefined()
    expect(info.isAbnormal).toBeUndefined()
    expect(info.abnormalFlagSource).toBeUndefined()
  })
})

describe('annotateLabTestResult', () => {
  it('annotates every component of every result on the order', () => {
    const test = {
      orderName: 'Lipid Panel',
      results: [
        {
          resultComponents: [
            { componentResultInfo: component({ value: '190', numericValue: 190, referenceRange: range({ low: 0, high: 100 }) }) },
            { componentResultInfo: component({ value: '35', numericValue: 35, referenceRange: range({ low: 40, high: 60 }) }) },
          ],
        },
      ],
    } as unknown as LabTestResult

    const flags = (annotateLabTestResult(test).results[0]!.resultComponents ?? [])
      .map((c) => c.componentResultInfo.abnormalFlag)
    expect(flags).toEqual(['high', 'low'])
  })

  it('survives an order with no results or no components at all', () => {
    expect(() => annotateLabTestResult({} as LabTestResult)).not.toThrow()
    expect(() => annotateLabTestResult({ results: [{}] } as unknown as LabTestResult)).not.toThrow()
  })
})

describe('annotateHistoricalResults', () => {
  it('annotates each point of a trend, so a rising value reads as high before today', () => {
    const history = {
      historicalResults: {
        'COMP-CHOL': {
          historicalResultData: [
            { value: '180', numericValue: 180, referenceRange: range({ low: 125, high: 200 }), abnormalFlagCategoryValue: 'Unknown', dateISO: '2024-01-08T09:00:00' },
            { value: '280', numericValue: 280, referenceRange: range({ low: 125, high: 200 }), abnormalFlagCategoryValue: 'Unknown', dateISO: '2026-01-10T09:00:00' },
          ],
        },
      },
    } as unknown as HistoricalResultsResponse

    const points = annotateHistoricalResults(history).historicalResults['COMP-CHOL']!.historicalResultData
    expect(points.map((p) => p.abnormalFlag)).toEqual(['normal', 'high'])
    expect(points.map((p) => p.isAbnormal)).toEqual([false, true])
  })

  it('survives a response with no trends', () => {
    expect(() => annotateHistoricalResults({} as HistoricalResultsResponse)).not.toThrow()
  })
})
