import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import PropTypes from 'prop-types';

import styles from './MyDropzone.module.scss';
import { UploadIcon, PlusIcon } from '../Icons/Icons';
import { WASM_MAX_INPUT_BYTES, FAST_MAX_INPUT_BYTES } from '../../utils/codecs';
import { ACCEPT_VIDEO } from '../../utils/presets';

// Render a binary-GiB cap as the round decimal "N GB" the user expects.
const gb = (bytes) => Math.floor(bytes / (1024 ** 3));

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
        {/* The cap is path-dependent: MP4/MOV take the WebCodecs fast path
            (streamed, not memory-bound) and get the high ceiling; other
            containers run on the wasm engine and keep the conservative one.
            gb() floors binary GiB to the round decimal the user expects. */}
        {`MP4/MOV up to ${gb(FAST_MAX_INPUT_BYTES)} GB, other formats up to ${gb(WASM_MAX_INPUT_BYTES)} GB. Larger? Trim them into parts first.`}
      </div>
    </div>
  );
}

MyDropzone.propTypes = {
  onFiles: PropTypes.func.isRequired,
};

export default MyDropzone;
