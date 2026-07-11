import React from 'react';
import PropTypes from 'prop-types';

import styles from './WarningNote.module.scss';
import { AlertIcon } from '../Icons/Icons';

// Persistent inline warning for problems the user can fix before encoding
// starts. Unlike a toast it stays visible until the underlying setting
// changes — validation must not vanish while the user is thinking.
function WarningNote({ children }) {
  return (
    <div className={styles.note} role="alert">
      <span className={styles.icon}>
        <AlertIcon color="#f4c04a" />
      </span>
      <span>{children}</span>
    </div>
  );
}

WarningNote.propTypes = {
  children: PropTypes.node.isRequired,
};

export default WarningNote;
