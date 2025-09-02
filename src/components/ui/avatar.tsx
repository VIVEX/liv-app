type Props = { src?: string | null; alt?: string; size?: number }

export default function Avatar({ src, alt = "avatar", size = 40 }: Props) {
  return (
    <img
      src={src || "https://placehold.co/80x80?text=👤"}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover"
    />
  )
}
