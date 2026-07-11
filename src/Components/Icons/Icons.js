import React from 'react';
import PropTypes from 'prop-types';

function base(paths, defaults = {}) {
  function Icon({ size, color, strokeWidth }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths}
      </svg>
    );
  }
  Icon.propTypes = {
    size: PropTypes.number,
    color: PropTypes.string,
    strokeWidth: PropTypes.number,
  };
  Icon.defaultProps = {
    size: defaults.size || 16,
    color: defaults.color || 'currentColor',
    strokeWidth: defaults.strokeWidth || 2,
  };
  return Icon;
}

// Brand mark (film frame pressed through a slot), fill-based rather than
// stroke-based like the icons below. Same geometry as Resources/
// limboencoder-icon.svg minus the gradient tile, which the header supplies.
export function LogoMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true">
      <g opacity="0.5">
        <rect x="54" y="34" width="132" height="78" rx="16" fill="#0B3D28" />
        <g fill="#0F935B">
          <rect x="64" y="42" width="11" height="11" rx="3" />
          <rect x="92" y="42" width="11" height="11" rx="3" />
          <rect x="120" y="42" width="11" height="11" rx="3" />
          <rect x="148" y="42" width="11" height="11" rx="3" />
          <rect x="176" y="42" width="11" height="11" rx="3" />
        </g>
        <path d="M 111 66 L 111 90 L 135 78 Z" fill="#0F935B" />
      </g>
      <rect x="38" y="122" width="164" height="13" rx="6.5" fill="#08130D" />
      <g transform="translate(120 170) rotate(-18)">
        <rect x="-40" y="-26" width="80" height="52" rx="13" fill="#08130D" />
        <g fill="#4EE894">
          <rect x="-30" y="-19" width="7" height="7" rx="2" />
          <rect x="-6" y="-19" width="7" height="7" rx="2" />
          <rect x="18" y="-19" width="7" height="7" rx="2" />
        </g>
        <path d="M -9 -8 L -9 14 L 13 3 Z" fill="#4EE894" />
      </g>
    </svg>
  );
}
LogoMark.propTypes = {
  size: PropTypes.number,
};
LogoMark.defaultProps = {
  size: 36,
};

export const UploadIcon = base(
  <>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 21h14a2 2 0 0 0 2-2v-4" />
    <path d="M3 15v4a2 2 0 0 0 2 2" />
  </>,
  { size: 34 },
);

export const PlusIcon = base(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
  { size: 17, strokeWidth: 2.4 },
);

export const ScissorsIcon = base(
  <>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88" />
    <path d="M14.47 14.48 20 20" />
    <path d="M8.12 8.12 12 12" />
  </>,
);

export const CheckIcon = base(
  <path d="M20 6 9 17l-5-5" />,
  { size: 17, strokeWidth: 2.4 },
);

export const DownloadIcon = base(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </>,
  { size: 18, strokeWidth: 2.4 },
);

export const ShareIcon = base(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.59 13.51 6.83 3.98" />
    <path d="m15.41 6.51-6.82 3.98" />
  </>,
  { size: 17 },
);

export const RedoIcon = base(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </>,
);

export const CloseIcon = base(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
  { size: 14, strokeWidth: 2.2 },
);

export const GearIcon = base(
  <>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const ChevronIcon = base(
  <path d="m6 9 6 6 6-6" />,
  { size: 18 },
);

export const ArrowRightIcon = base(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
  { size: 26 },
);

export const BoltIcon = base(
  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  { size: 19, strokeWidth: 2.6 },
);

export const AlertIcon = base(
  <>
    <path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>,
  { size: 16, strokeWidth: 2.2 },
);

export const CoffeeIcon = base(
  <>
    <path d="M10 2v2" />
    <path d="M14 2v2" />
    <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
    <path d="M6 2v2" />
  </>,
  { size: 15, strokeWidth: 2.2 },
);
