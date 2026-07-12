import PropTypes from 'prop-types';

// The per-file state record App holds for each added video (see
// docs/ARCHITECTURE.md § UI). Shared so the components that receive a file —
// or a list of them — declare a real contract instead of arrayOf(object).
const fileShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  file: PropTypes.instanceOf(File),
  name: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
  url: PropTypes.string,
  duration: PropTypes.number,
  trimStart: PropTypes.number,
  trimEnd: PropTypes.number,
  targetMB: PropTypes.number,
  platform: PropTypes.string,
  res: PropTypes.string,
  codec: PropTypes.string,
  fps: PropTypes.string,
  priority: PropTypes.oneOf(['balance', 'quality', 'smoothness']),
  quality: PropTypes.oneOf(['low', 'medium', 'high']),
  status: PropTypes.oneOf(['ready', 'encoding', 'done', 'error']).isRequired,
  progress: PropTypes.number,
  outUrl: PropTypes.string,
  outBlob: PropTypes.instanceOf(Blob),
  outBytes: PropTypes.number,
  outMime: PropTypes.string,
  outExt: PropTypes.string,
  errorLog: PropTypes.string,
});

export default fileShape;
