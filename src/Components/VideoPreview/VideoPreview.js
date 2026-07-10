import React from 'react';
import PropTypes from 'prop-types';

import styles from './VideoPreview.module.scss';

function VideoPreview({ url, name, onDuration }) {
  return (
    <div className={styles.frame}>
      <video
        muted
        controls
        playsInline
        src={url}
        className={styles.video}
        onLoadedMetadata={(e) => onDuration(e.target.duration)}
      />
      <div className={styles.badge}>{name}</div>
    </div>
  );
}

VideoPreview.propTypes = {
  url: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  onDuration: PropTypes.func.isRequired,
};

export default VideoPreview;
