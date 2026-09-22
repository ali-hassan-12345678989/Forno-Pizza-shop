import { describe, expect, it } from 'vitest'
import {
  MOVE_DOWN,
  MOVE_UP,
  canMove,
  changesFor,
  isReordered,
  moveItem,
  positionOf,
} from '../src/lib/menuOrder.js'

/**
 * Moving an item on the menu.
 *
 * Pure, so no Supabase here. The case that matters most is the one a swap gets
 * wrong: sort_order defaults to 0, so a menu nobody has reordered is entirely
 * ties, and exchanging two zeroes changes nothing. Every "fresh menu" test
 * below is that case.
 */

/** A menu as admin_menu_items() hands it over: already in (sort_order, name) order. */
const fresh = () => [
  { id: 'a', name: 'Chicken Tikka', sortOrder: 0 },
  { id: 'b', name: 'Margherita', sortOrder: 0 },
  { id: 'c', name: 'Zinger Burger', sortOrder: 0 },
]

const numbered = () => [
  { id: 'a', name: 'Chicken Tikka', sortOrder: 1 },
  { id: 'b', name: 'Margherita', sortOrder: 2 },
  { id: 'c', name: 'Zinger Burger', sortOrder: 3 },
]

const order = (items) => items.map((item) => item.id).join('')

describe('where an item sits', () => {
  it('counts from one, the way the screen says it', () => {
    expect(positionOf(numbered(), 'a')).toBe(1)
    expect(positionOf(numbered(), 'c')).toBe(3)
  })

  it('has no position for an item that is not on the menu', () => {
    expect(positionOf(numbered(), 'nope')).toBeNull()
  })

  it('will not move the first item up or the last one down', () => {
    expect(canMove(numbered(), 'a', MOVE_UP)).toBe(false)
    expect(canMove(numbered(), 'a', MOVE_DOWN)).toBe(true)
    expect(canMove(numbered(), 'c', MOVE_DOWN)).toBe(false)
    expect(canMove(numbered(), 'c', MOVE_UP)).toBe(true)
    expect(canMove(numbered(), 'nope', MOVE_UP)).toBe(false)
  })
})

describe('moving an item', () => {
  it('moves it one place down', () => {
    expect(order(moveItem(numbered(), 'a', MOVE_DOWN).items)).toBe('bac')
  })

  it('moves it one place up', () => {
    expect(order(moveItem(numbered(), 'c', MOVE_UP).items)).toBe('acb')
  })

  it('refuses to move past either end, and changes nothing when it does', () => {
    const items = numbered()
    const up = moveItem(items, 'a', MOVE_UP)
    expect(order(up.items)).toBe('abc')
    expect(up.changes).toEqual([])

    const down = moveItem(items, 'c', MOVE_DOWN)
    expect(order(down.items)).toBe('abc')
    expect(down.changes).toEqual([])
  })

  it('leaves an unknown id alone', () => {
    const result = moveItem(numbered(), 'nope', MOVE_DOWN)
    expect(order(result.items)).toBe('abc')
    expect(result.changes).toEqual([])
  })

  it('never mutates the list it was handed', () => {
    const items = numbered()
    moveItem(items, 'a', MOVE_DOWN)
    expect(order(items)).toBe('abc')
  })
})

describe('what has to be saved', () => {
  it('sends only the two rows that actually moved on a numbered menu', () => {
    const { changes } = moveItem(numbered(), 'a', MOVE_DOWN)
    expect(changes).toEqual([
      { id: 'b', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
    ])
  })

  it('numbers the whole menu the first time one is moved, because ties move nothing', () => {
    const { items, changes } = moveItem(fresh(), 'c', MOVE_UP)
    expect(order(items)).toBe('acb')

    // A swap would have written sortOrder 0 onto both and left the order alone.
    expect(changes).toEqual([
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
      { id: 'b', sortOrder: 3 },
    ])
    // Every number is distinct, so the order on screen is the order stored.
    expect(new Set(changes.map((row) => row.sortOrder)).size).toBe(changes.length)
  })

  it('sends nothing when the stored numbers already match the order', () => {
    expect(changesFor(numbered())).toEqual([])
  })

  it('sends everything when a fresh menu is numbered for the first time', () => {
    expect(changesFor(fresh())).toHaveLength(3)
  })

  it('stays correct when the Admin moves twice before saving', () => {
    const first = moveItem(numbered(), 'a', MOVE_DOWN) // b a c
    const second = moveItem(first.items, 'a', MOVE_DOWN) // b c a

    expect(order(second.items)).toBe('bca')
    // Measured against what the database still holds, not against the first move.
    expect(second.changes).toEqual([
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
      { id: 'a', sortOrder: 3 },
    ])
  })

  it('a move and its reverse leave nothing to save', () => {
    const down = moveItem(numbered(), 'a', MOVE_DOWN)
    const back = moveItem(down.items, 'a', MOVE_UP)
    expect(order(back.items)).toBe('abc')
    expect(back.changes).toEqual([])
  })
})

describe('has anything actually been moved', () => {
  it('says no when the list is the one it started as', () => {
    expect(isReordered(numbered(), numbered())).toBe(false)
  })

  it('says no just because the stored numbers are untidy', () => {
    // The case that made a freshly created item claim unsaved changes: nothing
    // has been dragged, but changesFor() has plenty to say.
    expect(changesFor(fresh()).length).toBeGreaterThan(0)
    expect(isReordered(fresh(), fresh())).toBe(false)
  })

  it('says yes once something has moved', () => {
    const { items } = moveItem(numbered(), 'a', MOVE_DOWN)
    expect(isReordered(items, numbered())).toBe(true)
  })

  it('says no again when the move is undone', () => {
    const down = moveItem(numbered(), 'a', MOVE_DOWN)
    const back = moveItem(down.items, 'a', MOVE_UP)
    expect(isReordered(back.items, numbered())).toBe(false)
  })

  it('says yes when an item has appeared or gone', () => {
    expect(isReordered(numbered().slice(1), numbered())).toBe(true)
  })
})
