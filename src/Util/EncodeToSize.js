import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

const ffmpeg = createFFmpeg({ log: true });

export default async ({
  video, targetSize, bitrate, bufferSize,
}) => {
  // Write the file to memory
  ffmpeg.FS('writeFile', 'inputFile.mp4', await fetchFile(video));

  // Run the FFMpeg command
  if (targetSize >= 50) {
    await ffmpeg.run(
      '-i',
      'inputFile.mp4',
      '-i',
      'inputFile.mp4',
      '-vf',
      'scale=1920:1080',
      '-c:v',
      'libx264',
      '-preset',
      'superfast',
      '-b:v',
      `${bitrate}k`,
      '-minrate',
      `${bitrate}k`,
      '-maxrate',
      `${bitrate}k`,
      '-bufsize',
      `${bufferSize}k`,
      '-ac',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      'encoded.mp4',
    );
  } else {
    await ffmpeg.run(
      '-i',
      'inputFile.mp4',
      '-vf',
      'scale=1280:720',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'superfast',
      '-b:v',
      `${bitrate}k`,
      '-minrate',
      `${bitrate}k`,
      '-maxrate',
      `${bitrate}k`,
      '-bufsize',
      `${bufferSize}k`,
      '-ac',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      'encoded.mp4',
    );
  }

  // Read the result
  const data = ffmpeg.FS('readFile', 'encoded.mp4');

  // Create a URL
  const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
  return (url);
};
