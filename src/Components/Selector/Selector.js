import React from 'react';
import PropTypes from 'prop-types';

import styles from './Selector.module.scss';

function Selector({ progress, tSize, setTSize }) {
  return (
    <div className={styles.select}>
      <select
        disabled={progress > 0}
        value={tSize}
        onChange={(e) => setTSize(parseInt(e.currentTarget.value, 10))}
      >
        <option value="8">Discord (Free, 8MB)</option>
        <option value="50">Discord (Level 2, 50MB)</option>
        <option value="100">Discord (Nitro, 100MB)</option>
      </select>
    </div>
  );
}

Selector.propTypes = {
  progress: PropTypes.number.isRequired,
  tSize: PropTypes.number.isRequired,
  setTSize: PropTypes.func.isRequired,
};

export default Selector;
