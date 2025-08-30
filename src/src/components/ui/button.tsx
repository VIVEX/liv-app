import { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition ${props.className || ""}`}
    />
  );
}
