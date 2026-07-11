import React from 'react';
import PropTypes from 'prop-types';

import styles from './TrimBar.module.scss';
import { ScissorsIcon } from '../Icons/Icons';
import { fmtTime } from '../../utils/format';

const TICKS = Array.from({ length: 44 }, (_, i) => i);
const MIN_GAP = 0.5;

function TrimBar({
  duration, trimStart, trimEnd, onChange,
}) {
  const dur = duration || 1;
  const end = trimEnd || duration;
  const regionLeft = (trimStart / dur) * 100;
  const regionWidth = ((end - trimStart) / dur) * 100;
  // When both thumbs bunch up at the right edge the end input (rendered on
  // top) would swallow every click; raise the start thumb in that case.
  const startOnTop = trimStart > dur / 2;

  const handleStart = (e) => {
    let v = parseFloat(e.target.value);
    v = Math.min(v, end - MIN_GAP);
    if (v < 0) v = 0;
    onChange({ trimStart: v });
  };

  const handleEnd = (e) => {
    let v = parseFloat(e.target.value);
    v = Math.max(v, trimStart + MIN_GAP);
    if (v > duration) v = duration;
    onChange({ trimEnd: v });
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>
            <ScissorsIcon />
          </span>
          <span>Trim clip</span>
        </div>
        <span className={styles.selected}>{`${fmtTime(end - trimStart)} selected`}</span>
      </div>
      <div className={styles.track}>
        <div className={styles.ticks}>
          {TICKS.map((t) => <div key={t} className={styles.tick} />)}
        </div>
        <div
          className={styles.region}
          style={{ left: `${regionLeft}%`, width: `${regionWidth}%` }}
        />
        <input
          type="range"
          className={styles.range}
          style={{ zIndex: startOnTop ? 3 : 2 }}
          min="0"
          max={duration}
          step="0.1"
          value={trimStart}
          onChange={handleStart}
          aria-label="Trim start"
          aria-valuetext={`Start ${fmtTime(trimStart)}`}
        />
        <input
          type="range"
          className={styles.range}
          style={{ zIndex: startOnTop ? 2 : 3 }}
          min="0"
          max={duration}
          step="0.1"
          value={end}
          onChange={handleEnd}
          aria-label="Trim end"
          aria-valuetext={`End ${fmtTime(end)}`}
        />
      </div>
      <div className={styles.legend}>
        <span>{`Start ${fmtTime(trimStart)}`}</span>
        <span>{`End ${fmtTime(end)}`}</span>
      </div>
    </div>
  );
}

TrimBar.propTypes = {
  duration: PropTypes.number.isRequired,
  trimStart: PropTypes.number.isRequired,
  trimEnd: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default TrimBar;
