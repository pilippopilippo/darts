# Auto-scoring with the phone camera

Goal: the phone (or tablet) on a stand next to the board reads every dart and enters the score, offline, with no extra
hardware. The player can always see what was read and correct it with one tap.

Status: **phase 1, lab only.** Test builds have *Settings → Lab → Camera auto-scoring (trial)*. Release builds do not show it,
and nothing in the lab touches matches, history or statistics.

## What already exists (research, November 2026)

| Who | How it works | What we take from it |
| --- | --- | --- |
| [Dartsmind](https://www.dartsmind.com/) (commercial app) | One phone rear camera, custom AI model running on the device, no calibration, any height and angle; optional second device as a second camera. Weak points reported by users: tight groupings, overhead light. | Proof that one phone camera is enough; the second-device idea for later. |
| [Autodarts](https://docs.autodarts.io) (commercial, free software) | Three USB cameras and an LED ring around the board on a small computer; compares consecutive frames to find the new dart, detects the hand and the takeout. | The throw → settle → takeout cycle. |
| [DeepDarts](https://arxiv.org/abs/2105.09880) (CVSports 2021, [code](https://github.com/wmcnally/deep-darts), [dataset](https://ieee-dataport.org/open-access/deepdarts-dataset)) | One image, one network that finds 4 calibration points on the board and the dart tips as "keypoints as objects"; a homography turns them into scores. About 16,000 labelled images (15k face-on phone photos, 1k from other angles). | The model design for phase 3 and a dataset to start from (check its licence before use). |
| [Webcam Dart Scorer](https://github.com/akipog1/webcam) (open source, Python/OpenCV) | One webcam, 5-point calibration (bull + D20/D6/D3/D11 outer wire), baseline difference, settle frames, tip = end of the dart blob on the camera side, takeout when the board looks empty again, record/replay with an accuracy report, two-camera line intersection. | Almost the same pipeline as our phase 1, plus the record-and-replay way of measuring. |
| [DartPilot](https://github.com/xXCrusaderXx/DartPilot) (GPL-3.0, C++) | Three cameras; reports each dart in millimetres with an uncertainty and may abstain instead of guessing; reproducible benchmark. | Report uncertainty and measure in mm. GPL code is not copied into this MIT project. |
| [Roboflow Universe](https://universe.roboflow.com/search?q=dart%20tip) | Several community datasets of dart tips (a few hundred to ~1,700 images). | Extra training data; licences differ per project. |

### Licences that matter

- **Ultralytics YOLO (v8, 11, 26) is AGPL-3.0, and Ultralytics says models trained with it are AGPL too.** Darts is MIT.
  Shipping a YOLO model would mean an Enterprise licence or releasing the whole app under AGPL. Prefer Apache-2.0 models:
  RTMDet / RTMPose (OpenMMLab), YOLOX.
- GPL projects (DartPilot) are for reading, not for copying code.
- Datasets: check each licence (DeepDarts is published on IEEE DataPort; Roboflow projects vary).

### Runtimes for a model on the phone

- In the WebView: [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) (WASM, WebGPU) or [LiteRT.js](https://developers.googleblog.com/en/litertjs-googles-high-performance-web-ai-inference/) (successor of TensorFlow.js). No native code, works in the iPhone web app too.
- Native Android: LiteRT or ONNX Runtime on CameraX frames inside a small Capacitor plugin, results sent to the page. Faster, Android only.
- Decide by measuring our own model on real phones, not from published benchmarks.

### Tools for the later phases

- Labelling: the lab itself (every dart it saves is a labelled sample), [CVAT](https://www.cvat.ai/) or [Label Studio](https://labelstud.io/) for corrections.
- Training: a free GPU on Google Colab or Kaggle; this repository's CI has no GPU.
- Measuring: record sessions with the expected scores and replay them (see *Metrics*).

## Plan

1. **Lab (this phase).** Fixed camera, calibration by 5 taps, colour frame differencing, tip from the dart blob, tap to correct,
   samples saved for training. Runs in the WebView with no new dependencies.
2. **Measure.** The owner plays sessions in the lab with *Save samples* on; we compute accuracy per segment and ring,
   tune thresholds and camera placement, and decide whether the heuristic is good enough for single darts.
3. **Learned tip detector.** Train an Apache-licensed keypoint model on the saved samples (plus DeepDarts if its licence allows)
   to find the tip in the crop around each detected change; later, the 4 calibration points too (automatic calibration).
4. **In the match.** X01 first: a camera strip on the game screen, darts entered automatically with the usual undo, caller as today.
   Bilingual strings, mockup first, layout from 320×480 to 800×1280.
5. **Optional:** a second phone as a second camera (two views remove the depth ambiguity of one camera).

## Phase 1 in this repository

| File | What it does |
| --- | --- |
| `www/autoscore/board.js` | Board geometry in mm: score of a point, distance to the nearest wire, wire polylines, calibration targets. |
| `www/autoscore/homography.js` | Homography from 4+ point pairs (normalised DLT, least squares), apply, invert, RMS error. |
| `www/autoscore/detector.js` | Frame-differencing detector: empty-board baseline that follows slow light changes, motion → settle → dart, takeout, pulled-dart rejection, tip from the blob's principal axis. |
| `www/autoscore/lab.html`, `lab.js` | The lab page: camera, calibration with magnifier, live detection, correction, adjustments, sample saving. |
| `tests/autoscore.test.js` | Unit tests on synthetic frames (`npm test`, also run by the APK workflow). |

### Pipeline

```text
camera 1280×720 ──► 480 px RGB frame ──► change vs. last state (inside the board) ──► still for N frames?
   ──► blobs ──► reject pulled darts ──► tip = end of the blob's axis on the camera side
   ──► homography (image → board mm) ──► segment and ring ──► "?" when closer than 2.5 mm to a wire
```

Colour differences matter: a grey dart on a red treble has almost the same brightness, so a greyscale difference loses the tip.

### Sample format (`Documents/DartsLab/dart-<time>.json` + `.jpg`)

```json
{ "version": 1, "image": "dart-2026-11-24T10-00-00-000Z.jpg", "width": 1280, "height": 720,
  "tip": [641.2, 172.4], "board_mm": [0.2, 104.8], "score": "T20",
  "all_tips": [[641.2, 172.4]], "corrected": false, "missed": false, "dart_in_visit": 1,
  "calibration": { "image_points": [[640, 360], "..."], "board_points": [[0, 0], [0, 170], [170, 0], [0, -170], [-170, 0]], "rms_mm": 0.4 },
  "detector": { "area": 210, "elong": 7.9, "threshold": 26, "tipMethod": "axis", "tipSide": "bottom" },
  "time": "2026-11-24T10:00:00.000Z" }
```

`corrected: true` means the player moved the dart by hand, so `tip` is the true position and the detector's guess was wrong:
these are the most useful samples for training.

## Metrics

- Segment + ring accuracy per dart (the score is right or wrong), reported together with the share of darts marked "?".
- Tip error in mm on corrected samples.
- Missed darts and false darts per 100 throws.
- Time from the dart landing to the score on screen.

## Known limitations of phase 1

- One camera cannot see depth: a dart near a wire can land on the wrong side ("?" marks those).
- Overlapping darts merge into one blob; the second may be missed (tap to add it).
- The tip is a heuristic; the camera position setting must match where the phone is.
- Moving the phone or a big light change needs a new calibration or a new empty-board capture.
- Auto exposure can create false changes: *Lock exposure and focus* where the camera allows it.
