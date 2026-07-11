import React from 'react';
import PropTypes from 'prop-types';

import styles from './Sidebar.module.scss';
import Selector from '../Selector/Selector';
import EstimateCard from '../EstimateCard/EstimateCard';
import AdvancedPanel from '../AdvancedPanel/AdvancedPanel';
import Button from '../Button/Button';
import fileShape from '../../fileShape';

// The settings rail for the active file: target preset, size estimate,
// advanced encode settings, and the Convert button. Dimmed and made inert
// while an encode is in flight. Presentational — all edits flow out via
// onUpdate, and convert/toggle are callbacks.
function Sidebar({
  active, isEncoding, showAdv, codecOptions, codecHint, estBytes, bitrateLabel,
  convertLabel, canConvert, ready, onUpdate, onToggleAdv, onConvert,
}) {
  return (
    <aside
      className={isEncoding ? styles.sidebarDimmed : styles.sidebar}
      {...(isEncoding ? { inert: '' } : {})}
    >
      <Selector
        platform={active.platform}
        targetMB={active.targetMB}
        onSelect={(p) => onUpdate(active.id, { targetMB: p.mb, platform: p.id })}
        onCustom={(mb) => onUpdate(active.id, {
          targetMB: Number.isNaN(mb) ? 0 : mb,
          platform: 'custom',
        })}
      />
      <EstimateCard origBytes={active.size} estBytes={estBytes} />
      <AdvancedPanel
        open={showAdv}
        onToggle={onToggleAdv}
        res={active.res}
        codec={active.codec}
        fps={active.fps}
        codecOptions={codecOptions}
        codecHint={codecHint}
        onChange={(patch) => onUpdate(active.id, patch)}
        bitrateLabel={bitrateLabel}
      />
      <Button onClick={onConvert} disabled={!ready || !canConvert}>
        {convertLabel}
      </Button>
    </aside>
  );
}

Sidebar.propTypes = {
  active: fileShape.isRequired,
  isEncoding: PropTypes.bool.isRequired,
  showAdv: PropTypes.bool.isRequired,
  codecOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
  codecHint: PropTypes.string,
  estBytes: PropTypes.number.isRequired,
  bitrateLabel: PropTypes.string.isRequired,
  convertLabel: PropTypes.string.isRequired,
  canConvert: PropTypes.bool.isRequired,
  ready: PropTypes.bool.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onToggleAdv: PropTypes.func.isRequired,
  onConvert: PropTypes.func.isRequired,
};

Sidebar.defaultProps = {
  codecHint: null,
};

export default Sidebar;
