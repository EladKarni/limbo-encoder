import React from 'react';
import PropTypes from 'prop-types';
import styles from './ProgressBar.module.scss';

function ProgressBar({ perc, name }) {
  const pct = Math.min(100, Math.max(0, perc));
  return (
    <div className={styles.card}>
      <div className={styles.ring}>
        <div className={styles.track} />
        <div className={styles.spinner} />
        <div className={styles.pct}>{`${Math.round(pct)}%`}</div>
      </div>
      <div className={styles.headline}>Encoding&hellip;</div>
      <div className={styles.name}>{name}</div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

ProgressBar.propTypes = {
  perc: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
};

export default ProgressBar;
