interface AvatarProps {
  emoji: string;
  color: string;
  size?: 'small' | 'medium' | 'large' | 'hero';
}

export default function Avatar({ emoji, color, size = 'medium' }: AvatarProps) {
  return (
    <span className={`avatar avatar-${color} avatar-${size}`} aria-hidden="true">
      {emoji}
    </span>
  );
}
