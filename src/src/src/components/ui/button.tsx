import React from 'react'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}
export function Button({ className = '', variant = 'default', size = 'md', ...props }: Props) {
  const base = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'
  const variants = { default: 'bg-black text-white hover:bg-gray-800', ghost: 'bg-transparent text-black hover:bg-gray-100', outline: 'bg-transparent border border-gray-300 hover:bg-gray-50' } as const
  const sizes = { sm: 'text-sm px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-base px-5 py-2.5' } as const
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
}
