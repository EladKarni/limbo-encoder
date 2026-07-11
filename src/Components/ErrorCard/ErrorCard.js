import React from 'react';
import PropTypes from 'prop-types';

import styles from './ErrorCard.module.scss';
import { CloseIcon, RedoIcon } from '../Icons/Icons';

function ErrorCard({ name, log, onRetry }) {
  return (
    <div className={styles.card}>
      <div className={styles.badge}>
        <CloseIcon size={15} color="#f4644a" strokeWidth={2.6} />
        Encoding failed
      </div>
      <div className={styles.name}>{name}</div>
      <pre className={styles.log}>{log || 'No encoder output was captured.'}</pre>
      <button type="button" className={styles.retry} onClick={onRetry}>
        <RedoIcon color="#e9edf3" />
        Try again
      </button>
    </div>
  );
}

ErrorCard.propTypes = {
  name: PropTypes.string.isRequired,
  log: PropTypes.string,
  onRetry: PropTypes.func.isRequired,
};

ErrorCard.defaultProps = {
  log: '',
};

export default ErrorCard;
