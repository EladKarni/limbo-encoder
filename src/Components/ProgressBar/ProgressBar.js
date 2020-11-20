import React from 'react';
import { Line } from 'rc-progress';
import PropTypes from 'prop-types';
import styles from './ProgressBar.module.scss';

function ProgressBar({ perc }) {
  return (
    <div className={styles.progress}>
      <h1>{`${perc.toFixed(2)}%`}</h1>
      <Line percent={perc} strokeWidth="4" trailColor="#949494" strokeColor="#9c8383" />
    </div>
  );
}

ProgressBar.propTypes = {
  perc: PropTypes.number.isRequired,
};

export default ProgressBar;
