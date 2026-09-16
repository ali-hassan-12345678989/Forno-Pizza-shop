import { useEffect } from 'react'
import { useShop } from '../context/SettingsContext'

/**
 * Sets the browser tab title for a page.
 *
 * The shop's name comes from the database like everywhere else, so the title is
 * composed here rather than written out per page — and pages pass the heading
 * they already render, so a rename is still one edit in content/copy.js.
 *
 * index.html carries a static title as well. That one is genuinely unavoidable:
 * it is what the tab says before any JavaScript has run.
 */
export function useDocumentTitle(pageTitle) {
  const shop = useShop()

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${shop.name}` : shop.name
  }, [pageTitle, shop.name])
}
