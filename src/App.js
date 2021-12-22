import React, { useState, useEffect } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import styles from './App.module.scss';

import MyDropzone from './Components/MyDropzone/MyDropzone';
import Button from './Components/Button/Button';
import Selector from './Components/Selector/Selector';
import ProgressBar from './Components/ProgressBar/ProgressBar';

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

  const encodeToSize = async () => {
    // Write the file to memory
    ffmpeg.FS('writeFile', 'inputFile.mp4', await fetchFile(video));

    // Run the FFMpeg command
    if (targetSize >= 50) {
      await ffmpeg.run(
        '-i', 'inputFile.mp4',
        '-i', 'inputFile.mp4',
        '-vf', 'scale=1920:1080',
        '-c:v', 'libx264',
        '-preset', 'superfast',
        '-b:v', `${bitrate}k`,
        '-minrate', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bufferSize}k`,
        '-ac', '2',
        '-c:a', 'aac',
        '-b:a', '128k',
        'encoded.mp4',
      );
    } else {
      await ffmpeg.run(
        '-i', 'inputFile.mp4',
        '-vf', 'scale=1280:720',
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'superfast',
        '-b:v', `${bitrate}k`,
        '-minrate', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bufferSize}k`,
        '-ac', '2',
        '-c:a', 'aac',
        '-b:a', '128k',
        'encoded.mp4',
      );
    }

    // Read the result
    const data = ffmpeg.FS('readFile', 'encoded.mp4');

    // Create a URL
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    setEncoded(url);
  };

  ffmpeg.setProgress(({ ratio }) => {
    setProgress(ratio * 100);
  });

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

        <Button sEncode={encodeToSize} vStatus={video}>
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
