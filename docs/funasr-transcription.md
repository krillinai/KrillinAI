# FunASR / SenseVoice transcription

OpenCreator can use a user-managed FunASR server through its OpenAI-compatible API. OpenCreator does not package Python, CUDA, model files, or a resident Python process.

Start the official server separately, for example:

```bash
pip install funasr fastapi uvicorn python-multipart
funasr-server --host 127.0.0.1 --model sensevoice --device cpu
```

In **AI services → Transcription**, choose **FunASR / SenseVoice**, set the server Base URL (normally `http://127.0.0.1:8000/v1`) and model alias (`sensevoice`, `paraformer`, or another alias exposed by the server). API Key is optional and is only sent as a Bearer credential when configured. The timeout applies to the transcription request.

The connection test checks `/v1/models` for the selected model; it does not execute a transcription or verify output quality. Transcription uses `POST /v1/audio/transcriptions` with multipart `file`, `model`, and `response_format=verbose_json`; the response is normalized into the runtime transcription contract. HTTP errors, invalid responses, timeouts, and cancellation remain executor failures.

See the [official FunASR OpenAI-compatible API example](https://github.com/modelscope/FunASR/tree/main/examples/openai_api) for server setup and model details.
