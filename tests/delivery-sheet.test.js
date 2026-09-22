import { describe, expect, it } from 'vitest'
import {
  addLine,
  hasLine,
  projectLevel,
  readyLines,
  removeLine,
  setQuantity,
} from '../src/lib/deliverySheet.js'
import { MAX_STOCK_RECEIPT } from '../src/config/inventory.js'

/**
 * The delivery sheet's rules, checked without a browser.
 *
 * These are pure, so unlike the rest of the suite they never touch Supabase.
 * receive_stock() still has the final say on every quantity — what is checked
 * here is that the screen does not offer to send something the database is
 * certain to refuse, and that it never silently drops a line the Manager typed.
 */

const MOZZARELLA = { id: 'mozz', name: 'Mozzarella', unit: 'g', stock: 4200, threshold: 5000 }
const BASIL = { id: 'basil', name: 'Fresh Basil', unit: 'g', stock: 0, threshold: 200 }

describe('lines on the sheet', () => {
  it('adds a line with no quantity typed into it yet', () => {
    expect(addLine([], 'mozz')).toEqual([{ ingredientId: 'mozz', quantity: '' }])
  })

  it('refuses to put the same ingredient on twice', () => {
    const once = addLine([], 'mozz')
    expect(addLine(once, 'mozz')).toBe(once)
    expect(addLine(once, 'mozz')).toHaveLength(1)
  })

  it('keeps other lines when one is taken off', () => {
    const lines = addLine(addLine([], 'mozz'), 'basil')
    expect(removeLine(lines, 'mozz')).toEqual([{ ingredientId: 'basil', quantity: '' }])
  })

  it('changes only the line that was typed into', () => {
    const lines = setQuantity(addLine(addLine([], 'mozz'), 'basil'), 'mozz', '900')
    expect(lines).toEqual([
      { ingredientId: 'mozz', quantity: '900' },
      { ingredientId: 'basil', quantity: '' },
    ])
  })

  it('reports whether an ingredient is already on the sheet', () => {
    expect(hasLine([], 'mozz')).toBe(false)
    expect(hasLine(addLine([], 'mozz'), 'mozz')).toBe(true)
  })

  it('never mutates the array it was handed', () => {
    const lines = addLine([], 'mozz')
    const snapshot = JSON.parse(JSON.stringify(lines))
    addLine(lines, 'basil')
    removeLine(lines, 'mozz')
    setQuantity(lines, 'mozz', '5')
    expect(lines).toEqual(snapshot)
  })
})

describe('which lines get sent', () => {
  it('sends a line with a real quantity', () => {
    const lines = setQuantity(addLine([], 'mozz'), 'mozz', '10000')
    expect(readyLines(lines)).toHaveLength(1)
  })

  it('skips a line the Manager has not filled in, rather than refusing the sheet', () => {
    const lines = setQuantity(addLine(addLine([], 'mozz'), 'basil'), 'mozz', '10000')
    expect(readyLines(lines).map((line) => line.ingredientId)).toEqual(['mozz'])
  })

  it('holds back every quantity receive_stock() would reject', () => {
    // Positive control first: without it, a readyLines() that returned nothing
    // at all would pass every assertion below.
    expect(readyLines([{ ingredientId: 'mozz', quantity: '1' }])).toHaveLength(1)

    for (const bad of ['0', '-5', '', '   ', 'ten', String(MAX_STOCK_RECEIPT + 1)]) {
      expect(readyLines([{ ingredientId: 'mozz', quantity: bad }])).toHaveLength(0)
    }
  })

  it('allows exactly the largest delivery the database allows', () => {
    expect(
      readyLines([{ ingredientId: 'mozz', quantity: String(MAX_STOCK_RECEIPT) }]),
    ).toHaveLength(1)
  })
})

describe('the projection shown before committing', () => {
  it('adds to what is there rather than replacing it', () => {
    expect(projectLevel(MOZZARELLA, '10000').after).toBe(14200)
  })

  it('says the shortage is cleared when the delivery clears it', () => {
    expect(projectLevel(MOZZARELLA, '10000')).toMatchObject({ willBeLow: false, willBeOut: false })
  })

  it('says it is still short when the delivery is too small', () => {
    expect(projectLevel(MOZZARELLA, '100')).toMatchObject({ willBeLow: true, willBeOut: false })
  })

  it('uses the same boundary as staff_ingredients(): low is below, not at', () => {
    // 4200 + 800 = 5000, exactly the threshold, which the database calls fine.
    expect(projectLevel(MOZZARELLA, '800').willBeLow).toBe(false)
    expect(projectLevel(MOZZARELLA, '799').willBeLow).toBe(true)
  })

  it('shows nothing at all until a usable quantity is typed', () => {
    expect(projectLevel(MOZZARELLA, '')).toBeNull()
    expect(projectLevel(MOZZARELLA, '0')).toBeNull()
    expect(projectLevel(MOZZARELLA, 'abc')).toBeNull()
    expect(projectLevel(null, '10')).toBeNull()
  })

  it('lifts an ingredient off zero', () => {
    expect(projectLevel(BASIL, '500')).toMatchObject({ after: 500, willBeOut: false })
  })
})
