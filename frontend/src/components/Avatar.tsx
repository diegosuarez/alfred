import React from 'react';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
}

/** Round avatar: shows the image when present, otherwise a deterministic
 * coloured circle with the contact's initial. */
export const Avatar: React.FC<AvatarProps> = ({ name, imageUrl, size = 28 }) => {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  const initial = (name.trim()[0] || '?').toUpperCase();
  // Deterministic hue from the contact's name so the same person keeps
  // the same colour across renders.
  const hue =
    [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `hsl(${hue}, 50%, 38%)`,
        color: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.45),
        fontWeight: 600,
        flexShrink: 0,
        letterSpacing: '0.5px',
      }}
    >
      {initial}
    </div>
  );
};
