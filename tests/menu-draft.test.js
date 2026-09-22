import { describe, expect, it } from 'vitest'
import { tidyItem, tidySize } from '../src/lib/menuDraft.js'

/**
 * The editor's copy of what the database does to text on the way in.
 *
 * admin_save_menu_item() and admin_save_menu_size() both use
 * nullif(btrim(...), ''), and api/adminMenu.js maps the resulting null back to
 * ''. A value that does not survive that round trip unchanged leaves the save
 * bar stuck on "Unsaved changes" — the save works, nothing differs, and the
 * screen insists otherwise.
 */

const round = (value) => (value === '' ? '' : value) // null comes back as '' — see fetchAdminMenu

describe('tidying an item the way the database will', () => {
  it('trims every text column admin_save_menu_item() trims', () => {
    expect(
      tidyItem({
        name: '  Chicken Tikka ',
        description: '\tMozzarella, onion  ',
        imageUrl: ' https://example.test/a.jpg ',
        category: ' Classics ',
        badge: ' hot ',
      }),
    ).toMatchObject({
      name: 'Chicken Tikka',
      description: 'Mozzarella, onion',
      imageUrl: 'https://example.test/a.jpg',
      category: 'Classics',
      badge: 'hot',
    })
  })

  it('turns whitespace-only into empty, which is what nullif() stores', () => {
    const tidied = tidyItem({
      name: 'A',
      description: '   ',
      imageUrl: '',
      category: '\n',
      badge: '',
    })
    expect(tidied.description).toBe(round(''))
    expect(tidied.category).toBe(round(''))
  })

  it('survives a field the API has not filled in', () => {
    expect(tidyItem({ name: 'A' })).toMatchObject({ description: '', imageUrl: '', badge: '' })
  })

  it('leaves everything else on the item alone', () => {
    const tidied = tidyItem({ name: ' A ', id: 'x', isActive: true, sortOrder: 4, sizes: [1] })
    expect(tidied).toMatchObject({ id: 'x', isActive: true, sortOrder: 4, sizes: [1] })
  })

  it('is idempotent — saving twice cannot keep changing the value', () => {
    const once = tidyItem({ name: ' A ', description: ' b ' })
    expect(tidyItem(once)).toEqual(once)
  })
})

describe('tidying a size', () => {
  it('trims the two text columns and leaves the price a number', () => {
    expect(tidySize({ size: ' Large ', serves: ' Serves 3-4 ', price: 1550, id: 's1' })).toEqual({
      size: 'Large',
      serves: 'Serves 3-4',
      price: 1550,
      id: 's1',
    })
  })

  it('is idempotent', () => {
    const once = tidySize({ size: ' M ', serves: ' x ' })
    expect(tidySize(once)).toEqual(once)
  })
})
