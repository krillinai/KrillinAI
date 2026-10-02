# Video translation: media and local transcription components

Video translation first uses imported SRT or available original-language platform captions. Successful caption translation does not download audio, video, or local transcription dependencies. Caption-processing/translation failures do not trigger transcription. When captions are unavailable, transcription downloads the audio track; the configured local engine and model are installed on demand if necessary.

Original video preparation is deferred until composition. Audio-only dubbing does not require video. Composition can reuse audio-only dubbing and original media cached within the same job; retries and the second aspect ratio do not repeat a completed source download.

For URL inputs, reusable source-video artifacts must have a matching source URL in their settings snapshot. Videos from a different URL or legacy artifacts without provenance are ignored rather than applied to a new source. Local-file inputs are unchanged.

Local component installation is owned by the Daemon, not a page or individual task. Manual downloads and task preparation share installation and progress. Canceling a waiting task detaches that subscriber without aborting another task's shared download. Daemon shutdown cancels active component downloads.

## Bilibili multipart inputs

Bilibili `?p=N` selects a single part. The shared URL parser retains that selection while removing tracking parameters; the embedded player uses `p=N`, not `page=1`. Metadata includes the part list, selected part title, CID, duration, and that part's dimensions. An explicit part is preselected. A multipart link without `p` asks the user to choose a part before continuing; a single-part video can continue without that extra selection.

Part lookup has a visible loading state and retry action. Invalid or out-of-range part parameters do not fall back to P1. Failed lookup does not start translation. The workflow API and shared Agent preflight both validate the selection, so Agent requests cannot bypass the UI. Collection metadata is cached for 30 seconds to avoid repeating the same upstream request for preview and validation.

Audio preparation, deferred video composition, and title/description lookup use `--no-playlist`. KrillinAI URL normalization preserves an explicit part for both audio and video. Direct CLI calls without a part are defensively limited to P1; the product workflow requires an explicit selection for multipart videos and never starts a whole-collection download.

## On-demand subtitle preview

Subtitle-only translation does not download the original video. The subtitle preview offers **Download source video and preview** for saved YouTube and Bilibili results. This explicitly starts the shared `prepare-source-video` stage with `inputResultVersion`; it never starts translation, transcription, dubbing, or rendering.

The stage uses the selected result snapshot's source, including the Bilibili part, rather than current draft settings. It attaches a verified, playback-compatible `source_video` only to that snapshot. It preserves subtitle references and edits, snapshot descriptions, result version numbers, and the translation job's status. Failures and cancellation do not discard completed subtitles; retry and resume retain the same input version.

The shared collaboration panel displays downloaded bytes and the current resource's real percentage. Separate video and audio resources can each restart their percentage; merging, validation, and conversion remain indeterminate. Once ready, the existing artifact preview automatically loads the video. Completed source media is reused for preview and subsequent composition when the normalized video identity matches; different Bilibili parts never share media. Missing or unusable cached media is downloaded again.

Download details are displayed independently of component-management links. Adapters explicitly opt localized progress messages into the shared panel, including original-video downloads with unknown totals.

Preview media is loaded by job and artifact identity, not by Runtime snapshots, diagnostic callback identities, or display-language changes. Those updates keep the existing video element, object URL, playback position, and subtitle draft intact. Changing preview media or leaving the workspace releases its object URLs; late responses for a discarded preview are also released.

## Component API

- `GET /creator/components/status`: Runtime platform/architecture, configured transcription provider/model, installed engine version, supported version, model inventory, installation status, and live byte progress.
- `POST /creator/components/download`: asynchronously prepare the currently configured local provider/model. Unsupported providers are rejected. Existing verified resources are reused.

Download percentage is based on actual transferred bytes and the final HTTP response's content length. Unknown totals remain indeterminate. Verification and extraction are separate phases; only verified installation is ready. Installed component inventory is reconstructed from disk on startup; unfinished temporary downloads are not advertised as installed.

The video translation notice links to `#/settings?tab=local-components`, preserving its draft, selected file, and an internal return route. The shared collaboration panel explains why component preparation is needed, that large model downloads may take time, and that transcription continues automatically. Component percentages are explicitly distinguished from translation progress.

Managed engine versions are supported, pinned versions, not claims about the latest upstream releases. Component management does not offer arbitrary upstream engine upgrades or platform-specific UI forks.

Component cards show only engines available on the current Runtime platform. The compact `Check status` action is read-only and uses the status endpoint; it never starts an installation. Download, complete-installation, and retry actions are available only when the selected component is not ready. Engine version and current model remain visible, while platform, install location, resource source, and model inventory are folded into component details. Download progress and preparation warnings stay outside the disclosure.

## Display languages and diagnostics

Component notices, dependency preparation, Bilibili part selection, source-video preview preparation, Codex image readiness, and Runtime recovery support Simplified Chinese, English, and Swedish. Switching the display language updates existing status messages and errors without restarting a download, reconnecting a session, resubmitting a task, or discarding subtitle edits and selected parts.

Dynamic progress and error summaries are derived from component states, task phases, preflight check IDs, and public error codes rather than displaying backend messages as the primary UI copy. Download bytes and percentages remain unchanged. Unknown-size downloads, verification, and extraction stay indeterminate.

Original error details remain available in a collapsed, localized diagnostics disclosure. Public issue diagnostics retain their existing credential and user-directory redaction before being included in an Agent inquiry. Video and part titles, subtitles, typed questions, paths, versions, and original logs are source data and are not automatically translated by changing the UI language.

New inline copy can pass an explicit Swedish third argument to `useLocalizedCopy`, or add its fixed English message to the Swedish inline catalog. Dynamic interpolations must provide an explicit Swedish string. Missing Swedish translations of legacy inline copy fall back to English, not Chinese; this is not a claim that every historical screen has been fully translated into Swedish. Add language-switch tests and fixed-copy coverage alongside new notices.
