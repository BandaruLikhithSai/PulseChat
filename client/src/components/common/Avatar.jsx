import './Avatar.css';

/**
 * Avatar — shows a user image or a coloured initial fallback.
 *
 * Props:
 *   src       — image URL (optional)
 *   name      — display name used for initials and alt text
 *   size      — pixel size (default 40)
 *   online    — boolean, shows green ring when true
 *   showStatus — boolean, shows status dot
 *   status    — 'online' | 'away' | 'offline'
 */
export default function Avatar({
  src,
  name = '',
  size = 40,
  online,
  showStatus = false,
  status = 'offline',
}) {
  const initials = getInitials(name);
  const colorClass = getColorClass(name);

  return (
    <div
      className={`avatar ${online ? 'avatar--online' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-label={name}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="avatar__img"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span className={`avatar__initials ${colorClass}`} aria-hidden="true">
          {initials}
        </span>
      )}
      {showStatus && (
        <span
          className={`avatar__status avatar__status--${status}`}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic colour based on name — 8 distinct accent backgrounds
const COLOURS = [
  'avatar--c1', 'avatar--c2', 'avatar--c3', 'avatar--c4',
  'avatar--c5', 'avatar--c6', 'avatar--c7', 'avatar--c8',
];

function getColorClass(name) {
  if (!name) return COLOURS[0];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}
