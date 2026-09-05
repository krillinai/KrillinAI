export function creatorRuntimeReleases() {
  return {
    'darwin-arm64': creatorRuntimeRelease({
      mediaTarget: 'darwin-arm64',
      ffmpegSha256: 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
      ffprobeSha256: 'bb2db6f5d8cef919da12fbf592119a987202a8c060a886f3cab091f9cab90b64',
      pythonAsset: 'cpython-3.13.15+20260825-aarch64-apple-darwin-install_only_stripped.tar.gz',
      pythonSha256: '149038dd0c194c25d4616d7e42a35f67f2edee96412788f74115819b6a4c8548'
    }),
    'darwin-x64': creatorRuntimeRelease({
      mediaTarget: 'darwin-x64',
      mediaVersion: '6.1.1',
      ffmpegSha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
      ffprobeSha256: 'fa3add0ce901f7241abe0dfc0155d958fc834aca3f8ce61f87cc712ae669c1e0',
      pythonAsset: 'cpython-3.13.15+20260825-x86_64-apple-darwin-install_only_stripped.tar.gz',
      pythonSha256: 'd33d61f7f4982c94216e14a43599c75657b7d0839277fc72bc6dbac53e8229bc'
    }),
    'linux-arm64': creatorRuntimeRelease({
      mediaTarget: 'linux-arm64',
      ffmpegSha256: '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
      ffprobeSha256: 'd17ae9b4c297d48e2521ba14e417bb0537c6ff77c584cdbcd6bb0d8d0307a2e8',
      pythonAsset: 'cpython-3.13.15+20260825-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz',
      pythonSha256: 'e5d0df1a6070a8614d808496e5ea28c727480e40ffcce1a94697a067f1690aa8'
    }),
    'linux-x64': creatorRuntimeRelease({
      mediaTarget: 'linux-x64',
      ffmpegSha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
      ffprobeSha256: '4f231a1960d83e403d08f7971e271707bec278a9ae18e21b8b5b03186668450d',
      pythonAsset: 'cpython-3.13.15+20260825-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
      pythonSha256: '8af9a8214c71b2dd698005e39fab87aad02a994330508857da4e6d1ba7e6ddb6'
    }),
    'win32-x64': creatorRuntimeRelease({
      mediaTarget: 'win32-x64',
      mediaVersion: '6.1.1',
      ffmpegSha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
      ffprobeSha256: '3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4',
      pythonAsset: 'cpython-3.13.15+20260825-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
      pythonSha256: 'c1dc1e267f2a81493ce6e94837263f648f1eb6d0df73a1492469c1fed025ce8f',
      executableSuffix: '.exe'
    })
  };
}

function creatorRuntimeRelease(input) {
  const suffix = input.executableSuffix ?? '';
  const mediaVersion = input.mediaVersion ?? '6.0';
  const pythonRelease = '20260825';
  const pythonVersion = '3.13.15';
  const ytDlpVersion = '2026.08.29.232711';
  const encodedPythonAsset = input.pythonAsset.replace('+', '%2B');
  return {
    ffmpeg: {
      version: mediaVersion,
      fileName: `ffmpeg${suffix}`,
      url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${input.mediaTarget}`,
      sha256: input.ffmpegSha256,
      executable: true,
      verify: ['-version'],
      expected: mediaVersionPattern('ffmpeg', mediaVersion)
    },
    ffprobe: {
      version: mediaVersion,
      fileName: `ffprobe${suffix}`,
      url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-${input.mediaTarget}`,
      sha256: input.ffprobeSha256,
      executable: true,
      verify: ['-version'],
      expected: mediaVersionPattern('ffprobe', mediaVersion)
    },
    ytDlp: {
      version: ytDlpVersion,
      fileName: 'yt-dlp',
      url: `https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/${ytDlpVersion}/yt-dlp`,
      sha256: 'e8bc4155d3af4fa4fa8efbb5146790f6e9da48266d103eea859de8a44ba194ad'
    },
    pythonRuntime: {
      version: pythonVersion,
      fileName: 'python-runtime.tar.gz',
      url: `https://github.com/astral-sh/python-build-standalone/releases/download/${pythonRelease}/${encodedPythonAsset}`,
      sha256: input.pythonSha256
    },
    certificateBundle: {
      version: '2026.07.22',
      fileName: 'cacert.pem',
      url: 'https://raw.githubusercontent.com/certifi/python-certifi/2026.07.22/certifi/cacert.pem',
      sha256: '9cc2a774b5198dcff14d9be1e66091f538975d867ce029a96bce15a55dfd730f'
    }
  };
}

function mediaVersionPattern(tool, version) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${tool} version ${escapedVersion}(?:[\\s-]|$)`, 'm');
}
