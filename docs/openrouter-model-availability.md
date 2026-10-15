# OpenRouter model availability

OpenCreator follows OpenRouter's account catalog and explicit access responses.
It does not maintain a country allowlist based on where our adapter tests ran.
Anthropic text models remain excluded because OpenCreator's current text adapter
does not support them. This compatibility constraint is independent of regional
access and still applies when OpenRouter includes them in the account catalog.

## Official regional policy

[OpenRouter's terms](https://openrouter.ai/terms), sections 5.7 and 6.8, describe
restrictions imposed by individual model providers and the country of the
originating request. They do not publish a universal model-by-country table.
The [provider routing guide](https://openrouter.ai/docs/guides/routing/provider-selection)
links to individual provider terms. A model can also have multiple providers,
so its vendor prefix is not a complete access policy.

[`GET /api/v1/models/user`](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails)
filters account provider preferences, privacy settings, and guardrails. The
request includes `output_modalities=all` to cover media as well as text.
This API does not promise to filter every restriction on the user's country.
Filtering through an EU or US regional hostname concerns data residency, not a
general list of supported user countries.

## Display policy

- A model must appear in both the gateway's compatible catalog and the actual
  customer's OpenRouter catalog. Expired or unavailable account metadata hides
  the models until refreshed.
- Text models must have Responses support in the gateway's compatible catalog
  and pass OpenCreator's compatibility policy, which excludes Anthropic models,
  OpenRouter routing models, and batch variants. Cached catalogs and default
  model selection apply the same policy.
  Login, catalog refresh, model selection, chat startup, and Creator preflight
  validate the catalog and configuration without additional inference. Only
  user-confirmed connection tests send separate paid requests, as described below.
  Startup inference also requires explicit test opt-in using
  `OPENCREATOR_ENABLE_PAID_STARTUP_PROBE=1` together with
  `OPENCREATOR_REQUIRE_CODEX_PROBE=1`; normal Desktop startup does not enable it.
- Image, video, speech, and transcription models are admitted without internal
  `verification` metadata. The customer's directory must include the model and
  its declared output modality must match. Published voices, image parameters
  from `/images/models`, and video parameters from `/videos/models` update the
  gateway's capability metadata. Optional discovery failures retain the existing
  gateway parameters. Internal adapter test records are release evidence, not
  a customer model allowlist.
- Ordinary transcription does not require subtitle timestamps. A subtitle
  request using `verbose_json` must return actual timestamps; missing timings
  are rejected without inventing them or resubmitting a paid request. Speech
  voices are validated against the published catalog regardless of test flags.
  Speech synthesis and previews use the upstream's default audio encoding;
  OpenCreator consumes the actual MIME and wraps PCM in WAV using the returned
  sample-rate and channel metadata. This avoids forcing MP3 on PCM-only models.
- An explicit model permission, region, or provider terms failure hides the exact
  model. After one hour, a successful account catalog refresh can restore it.
  Quota, moderation, unsupported request formats, rate limits, and temporary
  outages are not evidence of a geographic restriction. Accepted jobs and error
  bodies inside successful HTTP responses must also be checked for restrictions.
- Changing the account, key material or version, proxy, or observed network exit
  invalidates cached catalogs, access failures, and recent success observations.
  Account/key identities and the network exit are hashed; the customer's key
  and raw IP address are not persisted in this cache. Exit
  detection is optional and has a short timeout; failures do not block catalog
  loading or use of a valid catalog.

## Refresh and recovery

Catalogs are cached for five minutes and updated atomically after every page is
validated. Login fetches a fresh catalog with the customer's key through the same
network transport as generation. Concurrent queries share the same request.
Temporary refresh failures can reuse an unexpired catalog for the same account,
key version, and network. Expired catalogs hide models until refreshed. HTTP 401
and 403 catalog responses invalidate even an unexpired cached catalog.
HTTP 401 also requests a binding refresh through the existing account service to
recover a replaced model key, with a 30-second retry limit and no inference.

The account menu's Refresh models command and Reconnect force a catalog refresh.
Automatic retries after errors are limited to once per 30 seconds. Logout and
account changes cancel in-flight queries, and late results cannot restore the
previous account's models. Cache version 3 retains only unexpired exact-model
rejections from version 2; old allowed and unknown probe states are discarded.

An unavailable directory is reported separately from a successful empty or
incompatible directory. Both leave account sign-in and billing accessible.
Automatic Runtime recovery waits until idle. Explicit model selection is allowed
while tasks, model requests, and remote jobs are in progress. It updates the
default without replacing the same account's Runtime hosts or direct connection:
existing turns and Creator job snapshots keep their submitted models, and new
tasks use the updated default. Request snapshots and paid job receipts are
preserved, with no automatic resubmission after a restriction.

## Selection and actual request observations

Official service settings, the chat composer, and Creator tasks accept models
that appear in the current account catalog and pass adapter compatibility
checks. Selecting a model saves the choice immediately without a probe. Chat
startup and Creator preflight validate the selected model and configuration;
the task's own inference request is the first paid request.

Catalog membership is not evidence of successful inference. Account snapshots
expose separate model observations: `unverified`, `recent_success`, and
`restricted`. A completed task request records success for its specific
operation, such as Responses or Chat Completions, for five minutes. A success
on one text interface does not establish support for the other. Reading or
replaying a cached result does not refresh its success timestamp.

Explicit model permission, region, or provider terms rejections override
parallel successes and hide only that model. Timeouts, insufficient credits,
quota limits, rate limits, and temporary service failures clear recent success
evidence without quarantining the model. Late results from an old account,
key, network context, or changed model metadata cannot update current evidence.
Actual requests still handle live provider errors and keep accepted media job
IDs and receipts; a connection problem does not trigger another submission.

## Explicit connection tests

Each official model row has a connection-test action. It requires confirmation
that a real request may consume credits, including when a test fails. Text
tests let the user choose Conversation (Responses) or Text processing (Chat
Completions), and call only that interface. Cancelling sends no inference.
Testing a model does not change the default selection.

Every explicit test uses the current account's inference key and calls
`https://openrouter.ai/api/v1` through the existing direct adapter. There is no
probe credential request to the account gateway and no separate platform key.
Valid cached credentials allow a check even when the account gateway is offline
or the account access token has expired, just as they allow normal inference.
Model access, proxy routing, and key permissions therefore match generation.

These tests perform real inference and may consume customer credits; their
result reports `costBearer: customer`. Failure does not guarantee zero cost,
especially if a remote job was accepted. Probe receipts remain separate from task receipts so they
cannot be replayed as task outputs. HTTP 401 reports expired model credentials,
HTTP 402 and key limits report insufficient credits, and uncertain failures
do not automatically resubmit inference. A confirmed HTTP 401 may refresh the
binding and retry once only when the actual model key has been replaced.

The earlier implementation depended on
`POST /api/v1/client/probe-credentials`. On 2026-10-14 that endpoint returned
HTTP 404, stopping the check before OpenRouter was called. That dependency has
been removed; probe availability no longer requires a gateway rollout.

- A Conversation test checks a completed Responses tool call. A Text processing
  test checks a nonempty, completed Chat Completions reply. Each test is one call.
- Image checks one generated, decodable raster using published parameters.
- Speech checks a short delivery with audio MIME and nonempty content.
- Transcription checks a small known spoken WAV and nonempty transcription.
- Video uses minimum published duration and size, waits for completion, and
  retrieves nonempty video content. Acceptance alone does not pass.

Concurrent identical connection tests share one in-flight request. A new
user-confirmed test makes a fresh request. Recent success observations are
informational and are never a paid prerequisite for selection or task startup.

These checks test a specific small request, not every capability or parameter.
They use the same model key as subsequent tasks. Future requests remain
subject to live provider routing, permissions, moderation, and availability;
failures must still be handled without automatic paid resubmission.

## Live check on 2026-10-14

The same existing customer key returned HTTP 200 and 664 models from the Japan
proxy exit and the US exit reported by the production server's OpenRouter trace.
The sorted ID lists were identical. Both queries used `output_modalities=all` and
submitted no inference requests. This verifies the catalog integration for these
two exits, not worldwide geographic access.

The initial policy showed 309 text models and hid 135 media candidates because
the saved gateway catalog lacked internal adapter verification metadata. The
subsequent repair removes that dependency: media discovery uses OpenRouter's
catalog and capability APIs and does not require a gateway verification rollout.

The running development account and settings page subsequently showed 309 text,
49 image, 26 video, 35 speech, and 25 transcription models, with all five model
selectors enabled. Live platform-funded native-encoding checks passed for
Kokoro 82M (24 kHz mono WAV) and HeyGen Voice 1 Turbo (44.1 kHz mono WAV). Both
outputs decoded completely and contained non-silent audio. Voxtral Mini
Transcribe recognized the known test sentence and returned real segment timings.
Both independent test keys were disabled afterwards; customer credits were not
used. Management-key accounting confirmed USD 0.00040728 for four speech calls
and one transcription call, including the first two speech deliveries before
the verification script's decoder path was corrected. Image and video
submission, parameter validation, receipts and replay were
covered by targeted automated tests, without new paid image or video generations.
