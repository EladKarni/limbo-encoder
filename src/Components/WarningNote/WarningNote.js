import React from 'react';
import PropTypes from 'prop-types';

import styles from './WarningNote.module.scss';
import { AlertIcon } from '../Icons/Icons';

// Persistent inline warning for problems the user can fix before encoding
// starts. Unlike a toast it stays visible until the underlying setting
// changes — validation must not vanish while the user is thinking. role is
// "status" (polite), not "alert": it persists rather than interrupting, so it
// should not preempt the screen reader the way an assertive alert does.
function WarningNote({ children }) {
  return (
    <div className={styles.note} role="status">
      <span className={styles.icon}>
        <AlertIcon />
      </span>
      <span>{children}</span>
    </div>
  );
}

WarningNote.propTypes = {
  children: PropTypes.node.isRequired,
};

export default WarningNote;
