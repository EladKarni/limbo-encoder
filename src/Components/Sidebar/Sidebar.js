import React from 'react';
import PropTypes from 'prop-types';

import styles from './Sidebar.module.scss';
import Selector from '../Selector/Selector';
import EstimateCard from '../EstimateCard/EstimateCard';
import AdvancedPanel from '../AdvancedPanel/AdvancedPanel';
import Button from '../Button/Button';
import WarningNote from '../WarningNote/WarningNote';
import fileShape from '../../fileShape';

// The settings rail for the active file: target preset, size estimate,
// advanced encode settings, and the Convert button. Dimmed and made inert
// while an encode is in flight. Presentational — all edits flow out via
// onUpdate, and convert/toggle are callbacks.
function Sidebar({
  active, isEncoding, showAdv, codecOptions, codecHint, estBytes, bitrateLabel,
  quality, convertLabel, canConvert, convertHint, ready, onUpdate, onToggleAdv,
  onConvert,
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
        quality={quality}
      />
      <Button onClick={onConvert} disabled={!ready || !canConvert}>
        {convertLabel}
      </Button>
      {/* Why Convert is disabled, so a greyed button is never a dead end.
          Only shown when the block is fixable copy (not the transient
          "engine still loading" state, which the button label covers). */}
      {!canConvert && convertHint && <WarningNote>{convertHint}</WarningNote>}
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
  quality: PropTypes.shape({
    bpp: PropTypes.number,
    label: PropTypes.string,
    hint: PropTypes.string,
  }),
  convertLabel: PropTypes.string.isRequired,
  canConvert: PropTypes.bool.isRequired,
  convertHint: PropTypes.string,
  ready: PropTypes.bool.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onToggleAdv: PropTypes.func.isRequired,
  onConvert: PropTypes.func.isRequired,
};

Sidebar.defaultProps = {
  codecHint: null,
  convertHint: null,
  quality: null,
};

export default Sidebar;
