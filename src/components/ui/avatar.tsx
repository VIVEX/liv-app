import { ImgHTMLAttributes, ReactNode } from "react";

export function Avatar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-full overflow-hidden bg-gray-200 ${className}`}>{children}</div>;
}

export function AvatarImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} alt="" />;
}

export function AvatarFallback({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center w-full h-full text-gray-600">{children}</div>;
}
