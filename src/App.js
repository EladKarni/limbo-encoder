import React, { useState, useEffect } from 'react';
import { createFFmpeg } from '@ffmpeg/ffmpeg';
import styles from './App.module.scss';

import MyDropzone from './Components/MyDropzone/MyDropzone';
import Button from './Components/Button/Button';
import Selector from './Components/Selector/Selector';
import ProgressBar from './Components/ProgressBar/ProgressBar';
import EncodeToSize from './Util/EncodeToSize';

const ffmpeg = createFFmpeg({ log: true });

function App() {
  const [ready, setReady] = useState(false);
  const [video, setVideo] = useState();
  const [targetSize, setTargetSize] = useState(8);
  const [bitrate, setBitrate] = useState(0);
  const [bufferSize, setBufferSize] = useState(0);
  const [encoded, setEncoded] = useState();
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  const load = async () => {
    await ffmpeg.load();
    setReady(true);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setBitrate((((8000 * targetSize) / duration) * 0.95) - 128);
    setBufferSize(bitrate * 2);
  }, [targetSize, bitrate, duration, encoded]);

  ffmpeg.setProgress(({ ratio }) => {
    setProgress(ratio * 100);
  });

  const startEncoding = () => {
    setEncoded(EncodeToSize(video, targetSize, bitrate, bufferSize));
  };

  const renderSwitch = () => {
    if (encoded) {
      return (
        <video muted controls width="720">
          <source src={encoded} type="video/mp4" />
        </video>
      );
    } if (progress !== 0) {
      return <ProgressBar perc={progress} />;
    }

    return (
      <>
        <div className={styles.dropVideo}>
          {!video ? <MyDropzone setVideo={setVideo} />
            : (
              <video
                muted
                controls
                width="640"
                height="360"
                src={URL.createObjectURL(video)}
                onLoadedMetadata={(e) => {
                  setDuration(e.target.duration);
                }}
              />
            )}
        </div>
        <Selector progress={progress} tSize={targetSize} setTSize={setTargetSize} />

        <Button sEncode={startEncoding} vStatus={video}>
          {!video ? 'Upload A Video' : 'Convert'}
        </Button>
      </>
    );
  };

  return ready ? (
    <div className={styles.App}>
      <div className={styles.container}>
        {renderSwitch()}
      </div>
      <div className={styles.spThanks}>
        <h1>
          Special Thanks:
        </h1>
        <div>
          <h4>Nakajima Megumi#7432</h4>
        </div>
        <div>
          <h4>Flaeri</h4>
          <a href="https://blog.otterbro.com/">Flaeri&apos;s Blog</a>
        </div>
        <div>
          <h4>Freepik</h4>
          <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a>
        </div>
      </div>
    </div>
  )
    : (
      <p>Loading...</p>
    );
}

export default App;
