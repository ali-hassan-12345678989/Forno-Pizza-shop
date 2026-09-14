import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('menu_items')
      .select('id, name, description, menu_item_sizes(size, price)')
      .then(({ data, error }) => (error ? setError(error.message) : setItems(data)))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Forno Pizza</h1>
      <p data-testid="status">
        {error ? `Supabase error: ${error}` : items ? `Loaded ${items.length} menu item(s)` : 'Loading…'}
      </p>
      <ul>
        {items?.map((item) => (
          <li key={item.id}>
            {item.name} —{' '}
            {item.menu_item_sizes.map((s) => `${s.size} $${s.price}`).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
