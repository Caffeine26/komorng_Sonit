"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

interface PriceInputProps {
  valueCents: number
  onChange: (valueCents: number) => void
  placeholder?: string
  allowNegative?: boolean
}

export function PriceInput({ valueCents, onChange, placeholder = "0.00", allowNegative = false }: PriceInputProps) {
  const [displayValue, setDisplayValue] = useState("")

  // Sync internal display value when source valueCents changes
  useEffect(() => {
    if (valueCents === 0 && displayValue === "") return
    
    const floatVal = valueCents / 100
    // Prevent overriding if cursor is at the end or mid-typing (e.g. typing ".0" or ".00")
    if (parseFloat(displayValue) === floatVal) return
    
    setDisplayValue(valueCents === 0 ? "" : floatVal.toFixed(2))
  }, [valueCents])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawVal = e.target.value

    // Allow empty string to reset to 0
    if (rawVal === "") {
      setDisplayValue("")
      onChange(0)
      return
    }

    // Match float values with optional minus sign
    const regex = allowNegative ? /^-?\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,2}$/
    if (regex.test(rawVal)) {
      setDisplayValue(rawVal)
      
      const parsedFloat = parseFloat(rawVal)
      if (!isNaN(parsedFloat)) {
        onChange(Math.round(parsedFloat * 100))
      }
    }
  }

  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold select-none">$</span>
      <Input
        value={displayValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className="pl-8 text-sm font-medium"
      />
    </div>
  )
}
