import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import styles from './Selector.module.scss';

export const PLATFORMS = [
  {
    id: 'discord', name: 'Discord', sub: 'Free · 10 MB', mb: 10, color: '#5865F2',
  },
  {
    id: 'nitro', name: 'Discord', sub: 'Nitro · 500 MB', mb: 500, color: '#5865F2',
  },
  {
    id: 'whatsapp', name: 'WhatsApp', sub: '16 MB', mb: 16, color: '#25D366',
  },
  {
    id: 'gmail', name: 'Email', sub: 'Gmail · 25 MB', mb: 25, color: '#EA4335',
  },
  {
    id: 'reddit', name: 'Reddit', sub: '1 GB', mb: 1024, color: '#FF4500',
  },
  {
    id: 'slack', name: 'Slack', sub: '1 GB', mb: 1024, color: '#36C5F0',
  },
  {
    id: 'telegram', name: 'Telegram', sub: '2 GB', mb: 2048, color: '#229ED9',
  },
];

function Selector({
  platform, targetMB, onSelect, onCustom,
}) {
  const isCustom = platform === 'custom';
  // Hold the raw text locally so the field can be cleared or hold "4." while
  // typing; the parsed value flows up through onCustom.
  const [draft, setDraft] = useState(isCustom && targetMB > 0 ? String(targetMB) : '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(isCustom && targetMB > 0 ? String(targetMB) : '');
    }
  }, [isCustom, targetMB]);

  return (
    <div className={styles.card}>
      <div className={styles.label}>Target upload limit</div>
      <div className={styles.grid}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={platform === p.id}
            className={platform === p.id ? styles.chipActive : styles.chip}
            onClick={() => onSelect(p)}
          >
            <span className={styles.dot} style={{ background: p.color }} />
            <span className={styles.chipBody}>
              <span className={styles.chipName}>{p.name}</span>
              <span className={styles.chipSub}>{p.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={isCustom ? styles.customActive : styles.custom}>
        <span className={styles.customLabel}>Custom</span>
        <input
          type="number"
          min="1"
          value={isCustom ? draft : ''}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => {
            focusedRef.current = false;
            setDraft(isCustom && targetMB > 0 ? String(targetMB) : '');
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            onCustom(parseFloat(e.target.value));
          }}
          placeholder="MB"
          aria-label="Custom size limit in megabytes"
        />
        <span className={styles.customUnit}>MB</span>
      </div>
    </div>
  );
}

Selector.propTypes = {
  platform: PropTypes.string.isRequired,
  targetMB: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  onCustom: PropTypes.func.isRequired,
};

export default Selector;
