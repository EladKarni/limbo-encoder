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
            ? <CloseIcon size={17} color="#f4644a" strokeWidth={2.4} />
            : <CheckIcon color="#3ddc97" />}
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
