import React from 'react';
import PropTypes from 'prop-types';

import styles from './DoneCard.module.scss';
import {
  CheckIcon, DownloadIcon, ShareIcon, RedoIcon,
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
          <CheckIcon size={14} color="#06120c" strokeWidth={3} />
          {`DONE · ${fmtBytes(outBytes)}`}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.download} onClick={onDownload}>
          <DownloadIcon color="#06120c" />
          Download
        </button>
        <button type="button" className={styles.share} onClick={onShare}>
          <ShareIcon color="#e9edf3" />
          Share
        </button>
        <button type="button" className={styles.redo} onClick={onRedo}>
          <RedoIcon color="#8b95a5" />
          Redo
        </button>
      </div>
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
