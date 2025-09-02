import { PropsWithChildren } from "react"

export default function Card({ children }: PropsWithChildren) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  )
}
