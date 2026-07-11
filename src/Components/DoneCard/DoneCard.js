import React from 'react';
import PropTypes from 'prop-types';

import styles from './DoneCard.module.scss';
import {
  CheckIcon, DownloadIcon, ShareIcon, RedoIcon, CoffeeIcon,
} from '../Icons/Icons';
import { fmtBytes } from '../../utils/format';

function DoneCard({
  url, outBytes, onDownload, onShare, onRedo,
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        <video key={url} muted controls playsInline src={url} className={styles.video} />
        <div className={styles.badge}>
          <CheckIcon size={14} strokeWidth={3} />
          {`DONE · ${fmtBytes(outBytes)}`}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.download} onClick={onDownload}>
          <DownloadIcon />
          Download
        </button>
        <button type="button" className={styles.share} onClick={onShare}>
          <ShareIcon />
          Share
        </button>
        <button type="button" className={styles.redo} onClick={onRedo}>
          <RedoIcon />
          Redo
        </button>
      </div>
      <a
        className={styles.kofi}
        href="https://ko-fi.com/eksolutions"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.kofiIcon}>
          <CoffeeIcon />
        </span>
        <span>
          Saved you an upload?
          {' '}
          <strong>Buy me a coffee</strong>
        </span>
      </a>
    </div>
  );
}

DoneCard.propTypes = {
  url: PropTypes.string.isRequired,
  outBytes: PropTypes.number.isRequired,
  onDownload: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
};

export default DoneCard;
