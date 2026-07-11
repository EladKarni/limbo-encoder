import React from 'react';
import ReactDOMServer from 'react-dom/server';
import FileChips from '../Components/FileChips/FileChips';

// A representative file record in each status.
const rec = (over) => ({
  id: 'f1', name: 'clip.mp4', size: 1e6, status: 'ready', progress: 0, ...over,
});

test('fileShape accepts real records without PropTypes warnings', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const files = [
    rec({}),
    rec({ id: 'f2', status: 'encoding', progress: 42 }),
    rec({
      id: 'f3', status: 'done', outBytes: 5e5, outUrl: 'blob:x',
    }),
    rec({ id: 'f4', status: 'error', errorLog: 'boom' }),
  ];
  ReactDOMServer.renderToString(
    React.createElement(FileChips, {
      files, activeId: 'f1', onSelect: () => {}, onRemove: () => {}, onAdd: () => {},
    }),
  );
  const propTypeWarnings = spy.mock.calls.filter(
    (c) => String(c[0]).includes('Failed prop type'),
  );
  spy.mockRestore();
  expect(propTypeWarnings).toEqual([]);
});
