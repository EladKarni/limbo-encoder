import React from 'react';
import PropTypes from 'prop-types';
import styles from './Button.module.scss';

function Button({ sEncode, children, vStatus }) {
  return <button type="button" disabled={!vStatus} className={styles.btn} onClick={sEncode}>{children}</button>;
}

Button.defaultProps = {
  vStatus: undefined,
};

Button.propTypes = {
  sEncode: PropTypes.func.isRequired,
  children: PropTypes.string.isRequired,
  vStatus: PropTypes.object,
};

export default Button;
