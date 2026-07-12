import React from 'react';
import PropTypes from 'prop-types';

import styles from './SimpleControls.module.scss';

// The plain-language preset layer over the res/codec/fps dropdowns. Two 3-way
// segmented toggles — a priority (what to keep high when the fixed size budget
// forces a tradeoff) and a quality target — plus the live quality readout and
// the resolution/fps the preset resolved to. Presentational: the parent solves
// the preset into res/fps (via derivePreset) and passes the result down, and
// selections flow out through onPriority/onQuality. `custom` is true when the
// user has hand-edited the manual dropdowns to a combo no preset produces.
const PRIORITIES = [
  { id: 'quality', label: 'Quality', sub: 'Sharper picture' },
  { id: 'balance', label: 'Balanced', sub: 'Auto' },
  { id: 'smoothness', label: 'Smoothness', sub: 'Smoother motion' },
];
const QUALITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const QUALITY_CLASS = {
  Poor: 'qPoor', Fair: 'qFair', Good: 'qGood', Excellent: 'qExcellent',
};

function Segmented({
  name, options, value, custom, onChange,
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={name}>
      {options.map((o) => {
        const active = !custom && value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            className={active ? styles.segActive : styles.seg}
            onClick={() => onChange(o.id)}
          >
            <span className={styles.segLabel}>{o.label}</span>
            {o.sub && <span className={styles.segSub}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

Segmented.propTypes = {
  name: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    sub: PropTypes.string,
  })).isRequired,
  value: PropTypes.string.isRequired,
  custom: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

function SimpleControls({
  priority, quality, custom, qualityBand, geometryLabel,
  onPriority, onQuality,
}) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>Encode preset</div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Favor</span>
        <Segmented
          name="Priority"
          options={PRIORITIES}
          value={priority}
          custom={custom}
          onChange={onPriority}
        />
      </div>

      <p className={styles.explain}>
        Your file is squeezed to one size, so a sharper picture and smoother
        motion trade off. Pick what matters more — or let it balance.
      </p>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Quality</span>
        <Segmented
          name="Quality"
          options={QUALITIES}
          value={quality}
          custom={custom}
          onChange={onQuality}
        />
      </div>

      <div className={styles.readout}>
        <div className={styles.readoutHead}>
          <span className={styles.readoutLabel}>
            {custom ? 'Custom settings' : 'Estimated quality'}
          </span>
          <span className={styles.readoutValue}>
            {qualityBand ? qualityBand.label : '—'}
          </span>
        </div>
        {qualityBand && (
          <div className={`${styles.bar} ${styles[QUALITY_CLASS[qualityBand.label]]}`}>
            <span className={styles.fill} />
          </div>
        )}
        {geometryLabel && <div className={styles.geometry}>{geometryLabel}</div>}
      </div>
    </div>
  );
}

SimpleControls.propTypes = {
  priority: PropTypes.oneOf(['balance', 'quality', 'smoothness']).isRequired,
  quality: PropTypes.oneOf(['low', 'medium', 'high']).isRequired,
  // True when the manual dropdowns hold a combo no preset would produce.
  custom: PropTypes.bool.isRequired,
  qualityBand: PropTypes.shape({
    bpp: PropTypes.number,
    label: PropTypes.string,
    hint: PropTypes.string,
  }),
  // e.g. "1080p · 30 fps" — what the preset (or manual edit) resolved to.
  geometryLabel: PropTypes.string,
  onPriority: PropTypes.func.isRequired,
  onQuality: PropTypes.func.isRequired,
};

SimpleControls.defaultProps = {
  qualityBand: null,
  geometryLabel: null,
};

export default SimpleControls;
