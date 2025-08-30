import React from 'react'
export function Avatar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gray-200 ${className}`} />
}
export function AvatarImage({ src, alt = '', className = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={src} alt={alt} {...props} className={`h-full w-full object-cover ${className}`} />
}
export function AvatarFallback({ children }: { children?: React.ReactNode }) {
  return <span className="text-xs text-gray-600">{children}</span>
}
