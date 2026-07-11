import React from 'react';
import PropTypes from 'prop-types';

import styles from './Stage.module.scss';
import MyDropzone from '../MyDropzone/MyDropzone';
import VideoPreview from '../VideoPreview/VideoPreview';
import TrimBar from '../TrimBar/TrimBar';
import ProgressBar from '../ProgressBar/ProgressBar';
import DoneCard from '../DoneCard/DoneCard';
import ErrorCard from '../ErrorCard/ErrorCard';
import FileChips from '../FileChips/FileChips';
import WarningNote from '../WarningNote/WarningNote';
import fileShape from '../../fileShape';

// The main panel: renders by the active file's status (dropzone -> preview +
// trim -> progress -> done -> error), with the batch chips row underneath.
// Presentational — every state change flows out through the callbacks.
function Stage({
  active, files, overCeiling, overCeilingMsg,
  onFiles, onUpdate, onDownload, onShare, onRedo, onRetry,
  onSelect, onRemove, onAdd,
}) {
  return (
    <section className={styles.stage}>
      {!active && <MyDropzone onFiles={onFiles} />}

      {active && active.status === 'ready' && (
        <>
          <VideoPreview
            url={active.url}
            name={active.name}
            onDuration={(d) => {
              if (!Number.isFinite(d)) return;
              onUpdate(active.id, { duration: d, trimEnd: active.trimEnd || d });
            }}
          />
          <TrimBar
            duration={active.duration}
            trimStart={active.trimStart}
            trimEnd={active.trimEnd}
            onChange={(patch) => onUpdate(active.id, patch)}
          />
          {overCeiling && <WarningNote>{overCeilingMsg}</WarningNote>}
        </>
      )}

      {active && active.status === 'encoding' && (
        <ProgressBar perc={active.progress} name={active.name} />
      )}

      {active && active.status === 'done' && (
        <DoneCard
          url={active.outUrl}
          outBytes={active.outBytes || 0}
          onDownload={onDownload}
          onShare={onShare}
          onRedo={onRedo}
        />
      )}

      {active && active.status === 'error' && (
        <ErrorCard
          name={active.name}
          log={active.errorLog}
          onRetry={() => onRetry(active.id)}
        />
      )}

      {files.length > 0 && (
        <FileChips
          files={files}
          activeId={active ? active.id : null}
          onSelect={onSelect}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      )}
    </section>
  );
}

Stage.propTypes = {
  active: fileShape,
  files: PropTypes.arrayOf(fileShape).isRequired,
  overCeiling: PropTypes.bool.isRequired,
  overCeilingMsg: PropTypes.string.isRequired,
  onFiles: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

Stage.defaultProps = {
  active: null,
};

export default Stage;
