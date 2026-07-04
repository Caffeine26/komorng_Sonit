import { useState, useCallback, useMemo } from 'react'

export interface AdminCartItem {
  id: string // local unique id for cart instance
  menuItemId: string
  name: string
  quantity: number
  unitPriceCents: number
  variantId?: string
  variantName?: string
  addons: { groupId: string; optionId: string; name: string; priceDeltaCents: number }[]
  notes?: string
}

export function useAdminCart() {
  const [cart, setCart] = useState<AdminCartItem[]>([])

  const addItem = useCallback((item: Omit<AdminCartItem, 'id'>) => {
    setCart(prev => {
      const existing = prev.find(i =>
        i.menuItemId === item.menuItemId &&
        i.variantId === item.variantId &&
        i.variantName === item.variantName &&
        i.notes === item.notes &&
        JSON.stringify(i.addons) === JSON.stringify(item.addons)
      )
      if (existing) {
        return prev.map(i =>
          i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
        )
      }
      return [...prev, { ...item, id: Math.random().toString(36).substring(7) }]
    })
  }, [])

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCart(prev =>
      prev.map(i =>
        i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
      ).filter(i => i.quantity > 0)
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const totalCents = useMemo(() => cart.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0), [cart])
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart])

  return { cart, totalCents, itemCount, addItem, updateQuantity, removeItem, clearCart }
}
