import { ButtonHTMLAttributes } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline"
}

export default function Button({ variant = "default", className = "", ...props }: Props) {
  const base = "px-4 py-2 rounded-xl text-sm font-medium transition border"
  const styles =
    variant === "outline"
      ? "bg-transparent border-gray-300 hover:bg-gray-50"
      : "bg-black text-white border-black hover:opacity-90"
  return <button className={`${base} ${styles} ${className}`} {...props} />
}
