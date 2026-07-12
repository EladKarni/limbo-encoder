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
          <ChevronIcon size={15} />
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

// Map a quality band label to a modifier class so the readout is colour-coded.
const QUALITY_CLASS = {
  Poor: 'qPoor', Fair: 'qFair', Good: 'qGood', Excellent: 'qExcellent',
};

function AdvancedPanel({
  open, onToggle, res, codec, fps, codecOptions, codecHint, onChange,
  bitrateLabel, quality,
}) {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={open}>
        <span className={styles.toggleLabel}>
          <span className={styles.toggleIcon}>
            <GearIcon />
          </span>
          Advanced settings
        </span>
        <span className={open ? styles.chevronOpen : styles.chevron}>
          <ChevronIcon />
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
          {codecHint && <div className={styles.hint}>{codecHint}</div>}
          <Row
            label="Frame rate"
            value={fps}
            options={['Original', '60 fps', '30 fps', '24 fps']}
            onChange={(v) => onChange({ fps: v })}
          />
          <div className={styles.bitrate}>
            <span className={styles.bitrateLabel}>Estimated quality</span>
            <span className={styles.bitrateValue}>
              {quality ? quality.label : '—'}
            </span>
          </div>
          {quality && (
            <div className={`${styles.qualityBar} ${styles[QUALITY_CLASS[quality.label]]}`}>
              <span className={styles.qualityFill} />
            </div>
          )}
          {quality && <div className={styles.hint}>{quality.hint}</div>}
          <div className={styles.bitrateSub}>
            <span>Video bitrate</span>
            <span>{bitrateLabel}</span>
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
  codecHint: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  bitrateLabel: PropTypes.string.isRequired,
  quality: PropTypes.shape({
    bpp: PropTypes.number,
    label: PropTypes.string,
    hint: PropTypes.string,
  }),
};

AdvancedPanel.defaultProps = {
  codecHint: null,
  quality: null,
};

export default AdvancedPanel;
