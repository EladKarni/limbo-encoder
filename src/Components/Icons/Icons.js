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

export const ClapperIcon = base(
  <>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M16 20h2a2 2 0 0 0 2-2v-2" />
    <path d="m10 9 5 3-5 3z" />
  </>,
  { size: 24, strokeWidth: 2.4 },
);

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
