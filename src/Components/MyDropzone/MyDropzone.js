import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import PropTypes from 'prop-types';

import styles from './MyDropzone.module.scss';

function MyDropzone({ setVideo }) {
  const onDrop = useCallback((acceptedFiles) => {
    setVideo(acceptedFiles[0]);
  }, [setVideo]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className={isDragActive ? styles.dzActive : styles.dropzone} {...getRootProps()}>
      <input {...getInputProps()} />
      {
        isDragActive
          ? <p>Drop the files here ...</p>
          : <p>Drag &apos;n&apos; drop some files here, or click to select files</p>
      }
    </div>
  );
}

MyDropzone.propTypes = {
  setVideo: PropTypes.func.isRequired,
};

export default MyDropzone;
