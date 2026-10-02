# Video translation: media and local transcription components

Video translation first uses imported SRT or available original-language platform captions. Successful caption translation does not download audio, video, or local transcription dependencies. Caption-processing/translation failures do not trigger transcription. When captions are unavailable, transcription downloads the audio track; the configured local engine and model are installed on demand if necessary.

Original video preparation is deferred until composition. Audio-only dubbing does not require video. Composition can reuse audio-only dubbing and original media cached within the same job; retries and the second aspect ratio do not repeat a completed source download.

For URL inputs, reusable source-video artifacts must have a matching source URL in their settings snapshot. Videos from a different URL or legacy artifacts without provenance are ignored rather than applied to a new source. Local-file inputs are unchanged.

Local component installation is owned by the Daemon, not a page or individual task. Manual downloads and task preparation share installation and progress. Canceling a waiting task detaches that subscriber without aborting another task's shared download. Daemon shutdown cancels active component downloads.

## Bilibili multipart inputs

Bilibili `?p=N` selects a single part. The shared URL parser retains that selection while removing tracking parameters; the embedded player uses `p=N`, not `page=1`. Metadata includes the part list, selected part title, CID, duration, and that part's dimensions. An explicit part is preselected. A multipart link without `p` asks the user to choose a part before continuing; a single-part video can continue without that extra selection.

Part lookup has a visible loading state and retry action. Invalid or out-of-range part parameters do not fall back to P1. Failed lookup does not start translation. The workflow API and shared Agent preflight both validate the selection, so Agent requests cannot bypass the UI. Collection metadata is cached for 30 seconds to avoid repeating the same upstream request for preview and validation.

Audio preparation, deferred video composition, and title/description lookup use `--no-playlist`. KrillinAI URL normalization preserves an explicit part for both audio and video. Direct CLI calls without a part are defensively limited to P1; the product workflow requires an explicit selection for multipart videos and never starts a whole-collection download.

## API

- `GET /creator/components/status`: Runtime platform/architecture, configured transcription provider/model, installed engine version, supported version, model inventory, installation status, and live byte progress.
- `POST /creator/components/download`: asynchronously prepare the currently configured local provider/model. Unsupported providers are rejected. Existing verified resources are reused.

Download percentage is based on actual transferred bytes and the final HTTP response's content length. Unknown totals remain indeterminate. Verification and extraction are separate phases; only verified installation is ready. Installed component inventory is reconstructed from disk on startup; unfinished temporary downloads are not advertised as installed.

The video translation notice links to `#/settings?tab=local-components`, preserving its draft, selected file, and an internal return route. The shared collaboration panel explains why component preparation is needed, that large model downloads may take time, and that transcription continues automatically. Component percentages are explicitly distinguished from translation progress.

Managed engine versions are supported, pinned versions, not claims about the latest upstream releases. Component management does not offer arbitrary upstream engine upgrades or platform-specific UI forks.

Component cards show only engines available on the current Runtime platform. The compact `Check status` action is read-only and uses the status endpoint; it never starts an installation. Download, complete-installation, and retry actions are available only when the selected component is not ready. Engine version and current model remain visible, while platform, install location, resource source, and model inventory are folded into component details. Download progress and preparation warnings stay outside the disclosure.
