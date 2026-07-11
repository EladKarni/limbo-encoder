import React from 'react';
import PropTypes from 'prop-types';
import styles from './Button.module.scss';
import { BoltIcon } from '../Icons/Icons';

function Button({ onClick, disabled, children }) {
  return (
    <button type="button" disabled={disabled} className={styles.btn} onClick={onClick}>
      <BoltIcon color={disabled ? '#5b6472' : '#08130d'} />
      {children}
    </button>
  );
}

Button.defaultProps = {
  disabled: false,
};

Button.propTypes = {
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

export default Button;
