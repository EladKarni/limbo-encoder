import React from 'react';
import PropTypes from 'prop-types';

import styles from './FileChips.module.scss';
import { PlusIcon, CloseIcon } from '../Icons/Icons';
import { fmtBytes } from '../../utils/format';

const STATUS_COLORS = {
  done: '#3ddc97',
  encoding: '#f4c04a',
  ready: '#5b6472',
  error: '#f4644a',
};

function metaLabel(f) {
  if (f.status === 'encoding') return `${Math.round(f.progress)}%`;
  if (f.status === 'done') return fmtBytes(f.outBytes);
  if (f.status === 'error') return 'failed';
  return fmtBytes(f.size);
}

function FileChips({
  files, activeId, onSelect, onRemove, onAdd,
}) {
  return (
    <div className={styles.row}>
      {files.map((f) => (
        <div key={f.id} className={f.id === activeId ? styles.chipActive : styles.chip}>
          <button
            type="button"
            className={styles.select}
            aria-current={f.id === activeId ? 'true' : undefined}
            onClick={() => onSelect(f.id)}
          >
            <span className={styles.dot} style={{ background: STATUS_COLORS[f.status] }} />
            <span className={styles.info}>
              <span className={styles.name}>{f.name}</span>
              <span className={styles.meta}>{metaLabel(f)}</span>
            </span>
          </button>
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(f.id)}
            title="Remove"
            aria-label={`Remove ${f.name}`}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button type="button" className={styles.add} onClick={onAdd}>
        <PlusIcon size={15} color="#3ddc97" />
        Add
      </button>
    </div>
  );
}

FileChips.propTypes = {
  files: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

FileChips.defaultProps = {
  activeId: null,
};

export default FileChips;
