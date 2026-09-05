const args = process.argv.slice(2);

if (args.includes('--version')) {
  process.stdout.write('2026.08.29.232711\n');
  process.exit(0);
}

if (!args.includes('--dump-single-json')) {
  process.stderr.write(`Unsupported fake yt-dlp invocation: ${args.join(' ')}\n`);
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  id: 'C4gJinSiuG4',
  title: 'Packaged video probe fixture',
  webpage_url: 'https://www.youtube.com/watch?v=C4gJinSiuG4',
  extractor_key: 'Youtube',
  uploader: 'OpenCreator',
  thumbnail: 'https://i.ytimg.com/vi/C4gJinSiuG4/hqdefault.jpg',
  duration: 213,
  width: 1920,
  height: 1080,
  formats: [
    {
      format_id: '137',
      ext: 'mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      tbr: 4500,
      filesize: 119812500,
      vcodec: 'avc1.640028',
      acodec: 'none'
    },
    {
      format_id: '140',
      ext: 'm4a',
      abr: 129,
      filesize: 3434625,
      vcodec: 'none',
      acodec: 'mp4a.40.2'
    }
  ]
}));
