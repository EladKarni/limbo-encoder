import React from 'react';
import PropTypes from 'prop-types';

import styles from './Toast.module.scss';
import { CheckIcon, CloseIcon } from '../Icons/Icons';

function Toast({ message, tone }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {message && (
        <div className={tone === 'error' ? styles.toastError : styles.toast}>
          {tone === 'error'
            ? (
              <span className={styles.iconError}>
                <CloseIcon size={17} strokeWidth={2.4} />
              </span>
            )
            : (
              <span className={styles.iconOk}>
                <CheckIcon />
              </span>
            )}
          <span className={styles.text}>{message}</span>
        </div>
      )}
    </div>
  );
}

Toast.propTypes = {
  message: PropTypes.string,
  tone: PropTypes.oneOf(['ok', 'error']),
};

Toast.defaultProps = {
  message: null,
  tone: 'ok',
};

export default Toast;
