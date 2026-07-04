import React from "react"

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white rounded-2xl overflow-hidden border border-zinc-200/60">
      {children}
    </div>
  )
}
