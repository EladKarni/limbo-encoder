import React from 'react';
import PropTypes from 'prop-types';

import styles from './AdvancedPanel.module.scss';
import { GearIcon, ChevronIcon } from '../Icons/Icons';

function Row({
  label, value, options, onChange,
}) {
  const id = `adv-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label className={styles.rowLabel} htmlFor={id}>{label}</label>
      <div className={styles.selectWrap}>
        <select
          id={id}
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className={styles.selectChevron}>
          <ChevronIcon size={15} color="#5b6472" />
        </span>
      </div>
    </div>
  );
}

Row.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
};

function AdvancedPanel({
  open, onToggle, res, codec, fps, codecOptions, onChange, bitrateLabel,
}) {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={open}>
        <span className={styles.toggleLabel}>
          <GearIcon color="#8b95a5" />
          Advanced settings
        </span>
        <span className={open ? styles.chevronOpen : styles.chevron}>
          <ChevronIcon color="#8b95a5" />
        </span>
      </button>
      {open && (
        <div className={styles.body}>
          <Row
            label="Resolution"
            value={res}
            options={['Original', '1080p', '720p', '480p', '360p']}
            onChange={(v) => onChange({ res: v })}
          />
          <Row
            label="Codec"
            value={codec}
            options={codecOptions}
            onChange={(v) => onChange({ codec: v })}
          />
          <Row
            label="Frame rate"
            value={fps}
            options={['Original', '60 fps', '30 fps', '24 fps']}
            onChange={(v) => onChange({ fps: v })}
          />
          <div className={styles.bitrate}>
            <span className={styles.bitrateLabel}>Video bitrate</span>
            <span className={styles.bitrateValue}>{bitrateLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

AdvancedPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  res: PropTypes.string.isRequired,
  codec: PropTypes.string.isRequired,
  fps: PropTypes.string.isRequired,
  codecOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  bitrateLabel: PropTypes.string.isRequired,
};

export default AdvancedPanel;
