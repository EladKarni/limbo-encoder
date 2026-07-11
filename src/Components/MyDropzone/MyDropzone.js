import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import PropTypes from 'prop-types';

import styles from './MyDropzone.module.scss';
import { UploadIcon, PlusIcon } from '../Icons/Icons';
import { MAX_INPUT_BYTES } from '../../utils/codecs';
import { ACCEPT_VIDEO } from '../../utils/presets';

function MyDropzone({ onFiles }) {
  const onDrop = useCallback((acceptedFiles) => {
    onFiles(acceptedFiles);
  }, [onFiles]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT_VIDEO,
  });

  return (
    <div
      className={isDragActive ? styles.dzActive : styles.dropzone}
      {...getRootProps({ role: 'button', 'aria-label': 'Choose videos to encode' })}
    >
      <input {...getInputProps()} />
      <div className={styles.icon}>
        <UploadIcon />
      </div>
      <div className={styles.headline}>Drop a video to begin</div>
      <div className={styles.sub}>
        Drag &amp; drop, or click to browse. MP4, MOV, WebM, MKV &mdash; batch is supported.
      </div>
      <div className={styles.cta}>
        <PlusIcon />
        Choose video
      </div>
      <div className={styles.limit}>
        {/* MAX_INPUT_BYTES is 4 GiB; /1e9 then floor renders it as the round
            decimal "4 GB" the user expects (matches App.oversizedMsg). */}
        {`Files up to ${Math.floor(MAX_INPUT_BYTES / 1e9)} GB. Larger videos? Trim them into parts first.`}
      </div>
    </div>
  );
}

MyDropzone.propTypes = {
  onFiles: PropTypes.func.isRequired,
};

export default MyDropzone;
