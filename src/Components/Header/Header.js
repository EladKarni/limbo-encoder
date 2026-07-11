import React from 'react';
import PropTypes from 'prop-types';

import styles from './Header.module.scss';
import { LogoMark } from '../Icons/Icons';

const PILL_CLASS = { ready: 'pill', loading: 'pillLoading', error: 'pillError' };
const PILL_TEXT = {
  ready: '100% local · nothing uploaded',
  loading: 'loading encoder…',
  error: 'encoder failed to load — reload to retry',
};

// App header: brand mark + the live engine-status pill.
function Header({ engine }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <LogoMark size={36} />
        </div>
        <div>
          <div className={styles.title}>
            LIMBO
            <span>·</span>
            ENCODER
          </div>
          <div className={styles.tagline}>Shrink any video to fit any upload limit</div>
        </div>
      </div>
      <div className={styles[PILL_CLASS[engine]]} role="status" aria-live="polite">
        <span className={styles.pillDot} />
        <span>{PILL_TEXT[engine]}</span>
      </div>
    </header>
  );
}

Header.propTypes = {
  engine: PropTypes.oneOf(['ready', 'loading', 'error']).isRequired,
};

export default Header;
