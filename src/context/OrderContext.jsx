import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS, readStored, writeStored } from '../config/storage'
import { ORDER_TYPES } from '../config/fulfillment'

const OrderContext = createContext(null)

export function OrderProvider({ children }) {
  const [orderType, setOrderType] = useState(() =>
    readStored(STORAGE_KEYS.orderType, ORDER_TYPES.delivery),
  )
  const [address, setAddress] = useState(() => readStored(STORAGE_KEYS.address, ''))

  useEffect(() => writeStored(STORAGE_KEYS.orderType, orderType), [orderType])
  useEffect(() => writeStored(STORAGE_KEYS.address, address), [address])

  const value = useMemo(
    () => ({
      orderType,
      setOrderType,
      address,
      setAddress,
      isDelivery: orderType === ORDER_TYPES.delivery,
    }),
    [orderType, address],
  )

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
}

export function useOrder() {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrder must be used inside OrderProvider')
  return ctx
}
