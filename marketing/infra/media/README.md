# media-worker (spec)

Small HTTP service on the Mac mini that n8n calls for W14. Separate container so n8n stays stock.

Image: `python:3.12-slim` + `ffmpeg` + `whisper.cpp` (base.en model) + a license plate / face detector (for example an open-source YOLO plate model via `ultralytics`, and OpenCV's face detector).

Endpoints (JSON in, JSON out, auth via `X-Hook-Secret`):

- `POST /process` `{media_id, raw_paths[], brand, keep_faces: bool}`
  1. Download raw files from Supabase Storage (signed URLs).
  2. `ffmpeg` normalize: scale/crop to 1080x1920, 30 fps, `loudnorm=I=-14`.
  3. Detect plates (always) and faces (unless `keep_faces`) every 5th frame, track boxes, apply `boxblur`.
  4. `whisper.cpp` → SRT, burn captions (bold, bottom third, brand green `#39d353` outline).
  5. Concatenate, append 2-second end card per brand (logo, phone, site).
  6. Upload to `ugc/final/{media_id}.mp4`, return `{final_path, duration_sec, transcript, blur_ok}`.
  `blur_ok` is false if the detector errored or confidence was low on any frame with a vehicle; W15 refuses to publish when false.
- `GET /health`

Local alternative while the worker is not built: run the `clipify` / `cut-video` Claude skills on Matt's machine for cuts, blur plates manually, and drop finals into `ugc/final/` with a `media_assets` row set to `ready`.
