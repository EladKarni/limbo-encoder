import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import PropTypes from 'prop-types';

import styles from './MyDropzone.module.scss';
import { UploadIcon, PlusIcon } from '../Icons/Icons';

// MKV/AVI often report an empty or generic MIME type, so extensions are
// listed alongside video/* to keep this in step with App.addFiles.
export const ACCEPT_VIDEO = 'video/*,.mp4,.mov,.webm,.mkv,.avi';

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
        <UploadIcon color="#3ddc97" />
      </div>
      <div className={styles.headline}>Drop a video to begin</div>
      <div className={styles.sub}>
        Drag &amp; drop, or click to browse. MP4, MOV, WebM, MKV &mdash; batch is supported.
      </div>
      <div className={styles.cta}>
        <PlusIcon color="#06120c" />
        Choose video
      </div>
      <div className={styles.limit}>
        Files up to 4 GB &mdash; a WebAssembly memory cap set by browsers, not by this app.
      </div>
    </div>
  );
}

MyDropzone.propTypes = {
  onFiles: PropTypes.func.isRequired,
};

export default MyDropzone;
