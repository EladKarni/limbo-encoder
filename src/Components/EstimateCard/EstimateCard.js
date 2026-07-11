import React from 'react';
import PropTypes from 'prop-types';

import styles from './EstimateCard.module.scss';
import { ArrowRightIcon } from '../Icons/Icons';
import { fmtBytes } from '../../utils/format';

function EstimateCard({ origBytes, estBytes }) {
  const ratio = origBytes ? estBytes / origBytes : 1;
  const barWidth = Math.max(3, Math.min(100, ratio * 100));
  const reduction = origBytes ? (1 - ratio) * 100 : 0;

  let reductionLabel = 'no change';
  let reductionClass = styles.flat;
  if (reduction > 0.5) {
    reductionLabel = `−${reduction.toFixed(0)}%`;
    reductionClass = styles.smaller;
  } else if (reduction < -0.5) {
    reductionLabel = `+${Math.abs(reduction).toFixed(0)}% (larger)`;
    reductionClass = styles.larger;
  }

  return (
    <div className={styles.card}>
      <div className={styles.label}>Estimated result</div>
      <div className={styles.sizes}>
        <div>
          <div className={styles.sizeLabel}>Original</div>
          <div className={styles.sizeValue}>{fmtBytes(origBytes)}</div>
        </div>
        <ArrowRightIcon color="#4ee894" />
        <div className={styles.target}>
          <div className={styles.sizeLabel}>Target</div>
          <div className={styles.targetValue}>{fmtBytes(estBytes)}</div>
        </div>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${barWidth}%` }} />
      </div>
      <div className={styles.reduction}>
        <span className={styles.reductionLabel}>Size reduction</span>
        <span className={reductionClass}>{reductionLabel}</span>
      </div>
    </div>
  );
}

EstimateCard.propTypes = {
  origBytes: PropTypes.number.isRequired,
  estBytes: PropTypes.number.isRequired,
};

export default EstimateCard;
