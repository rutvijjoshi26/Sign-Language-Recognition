# Sign Language Recognition (English and Hindi)

A browser app that detects 51 hand signs and shows them as English or Hindi words. A YOLOv5l model (about 46M parameters, 185.6 MB of weights) runs entirely on the device through TensorFlow.js, so images and camera frames never leave the browser. A second, lighter mode recognizes 50 Indian Sign Language word signs from hand and body landmarks (see [below](#indian-sign-language-recognition-from-landmarks-include-50)).

## Run it locally

```bash
git clone https://github.com/rutvijjoshi26/Sign-Language-Recognition.git
cd Sign-Language-Recognition
npm install        # or: yarn install
npm start          # or: yarn start
```

Other scripts:

- `npm run build` builds a static site into `dist/`. To host it under a subpath (for example GitHub Pages), set the base path: `BASE_PATH=/Sign-Language-Recognition/ npm run build`. The model is loaded relative to that base.
- `npm run preview` serves the production build.
- `npm test` runs the unit tests for the smoothing, transcript and detection helpers (Node 20 or newer).

## Using the app

- **Open image**: detects signs in a photo and lists them with their confidence.
- **Open video**: runs detection on every frame of an uploaded video (with playback controls).
- **Start camera**: live detection from the device camera. The front camera is used by default; choose **Back** in the Camera menu to switch.
- **Language**: shows results in English or Hindi. Switching is instant because both languages use the same model and only the label list changes.

Boxes and confidence scores are drawn over the picture, and the same information is always available as text below it.

Supported languages: **English** and **Hindi**.

## Accessibility

- **Text output for every result.** The current sign and its confidence are shown as text, and every recognized sign is appended to a transcript. The canvas overlay is decorative; nothing is conveyed only by drawing.
- **Screen reader announcements without spam.** The transcript is an ARIA live log (`role="log"`, polite) that announces only newly added words. A word is added only after it wins a majority vote over the last 8 frames (5 of 8, released below 3 of 8), and an immediate repeat of the same word within 1.5 s is ignored, so a flickering prediction is not announced over and over.
- **Optional speech.** "Speak signs aloud" reads each new word with the Web Speech API in the selected language (`en-US` or `hi-IN`). It is off by default.
- **Keyboard.** Every control is a native button, select or checkbox, reachable with Tab, with a visible 3 px focus outline. Uploaded videos get native player controls.
- **Labels and alternatives.** Form controls have labels, the uploaded image has alt text, the video is labeled, Hindi words are marked `lang="hi"`, and the page uses `main`, heading and landmark structure.
- **Inline errors.** Camera and model problems (permission denied, no camera, camera in use, network failure) appear as an inline `role="alert"` message with a Dismiss button. There are no blocking `alert()` dialogs.
- **Contrast and motion.** Text and controls use dark-on-light or white-on-black colors, box labels are drawn as white text on a dark tag, and the loading animation stops when the system asks for reduced motion.

## Performance

Measured on 2026-11-03 on an Apple M2 MacBook (8 GB RAM, macOS 26.5.1) in headed Google Chrome 156.0.8078.80, WebGL through ANGLE on Metal (real GPU), TensorFlow.js 4.1.0, against `vite build` + `vite preview` on localhost. "Before" is the app as of commit `fce9021`; "after" is this version. The machine was shared with other heavy jobs during the runs, so timings are noisy: before and after runs were interleaved and the quietest pair is reported, with raw logs kept outside the repo.

| Metric | Before | After |
| --- | --- | --- |
| Lighthouse accessibility score (idle / image loaded) | 96 / 86 | 100 / 100 |
| axe-core violations, WCAG 2.2 AA + best practice (idle / image loaded) | 2 / 3 | 0 / 0 |
| Model download on first visit | 185.6 MB | 185.6 MB |
| Cold load to ready, localhost, cache disabled (median of 3 interleaved runs) | 11.3 s (range 6.2 to 11.5 s) | 6.2 s (range 5.6 to 21.3 s) |
| Switching language to Hindi | downloads a second 185.6 MB model, 5.3 s | no download, instant label swap |
| Warm-up pass (in the benchmark page) | 2.5 s | 1.5 s |
| Per-frame latency, WebGL, 150 held-out frames: median / p95 | 619 ms / 1,729 ms | 589 ms / 927 ms |
| Effective throughput, WebGL | 1.22 FPS | 1.64 FPS |
| Per-frame latency, wasm (threads + SIMD), 10 frames: median | 2,583 ms | 2,160 ms |
| WebGPU | not available in TensorFlow.js 4.1.0 | not available in TensorFlow.js 4.1.0 |
| Tensors after 150 frames (358 at start) | 508 (one 4.9 MB input tensor leaked per frame) | 358 |
| Peak `tf.memory()` GPU bytes over 150 frames | 1,169 MB | 186 MB |
| Uploaded video: samples with boxes drawn during 24 s of playback | 0 of 30 (video detection never ran) | 21 of 30 |
| Label changes per minute, 30 s non-signing interview clip | 12 | 0 |
| False sign activations, same clip | 3 (6 per minute) | 0 |
| Signing clip (50 signs, 1 s each, camera-like jitter): wrong activations / signs recognized | 3 / 49 of 50 | 1 / 49 of 50 |

Method notes:

- Frames: 150 images from the valid/test splits of the Roboflow dataset (3 per class, resized to 640 px). The signing clip holds one held-out image per class for 15 frames (1 s at 15 fps) with random shift, scale, brightness and pixel noise. The non-signing clip is the first 30 s (450 frames at 15 fps) of a public-domain AFN radio interview from Wikimedia Commons, with people talking and gesturing but not signing.
- "Before" activations count every time the canvas starts showing a new top label at the original 0.2 threshold. "After" activations count transcript entries (top-1 above 0.5, majority vote over 8 frames, 5 to enter, below 3 to release).
- Cold load downloads the same bytes and runs the same warm-up in both versions, so the cold-load spread reflects machine load more than a code change.
- The per-frame code is otherwise identical (same preprocessing and model), so most of the latency difference comes from the leaked tensors in the original loop and from run-to-run noise; under heavy load single frames took up to 25 s in both versions. When the machine was quiet, the same WebGL frames ran at 350 to 370 ms each.

## Indian Sign Language recognition from landmarks (INCLUDE-50)

A second, much lighter mode recognizes 50 isolated Indian Sign Language (ISL) word signs and captions them in English and Hindi. Open it with `?mode=landmark` (for example `http://localhost:5173/?mode=landmark`) or the link at the top of the page. It works on a live webcam or an uploaded video, and every frame is processed in the browser: no video leaves the device, and all models and the MediaPipe runtime are served from `public/landmark/`.

### How it works

1. **Landmarks.** MediaPipe Tasks Vision runs the Hand Landmarker (up to two hands, 21 points each) and the Pose Landmarker lite model (33 body points) on every frame. ISL signs often use both hands and depend on where the hands are relative to the face and body, so the hand points are combined with the pose points for the face (nose, eyes, ears, mouth), shoulders, elbows and wrists. This pair was chosen over the Holistic Landmarker because it costs about the same to download (13.6 MB vs 13.7 MB) and skips the 468-point face mesh, which isolated word signs rarely need.
2. **Features** (`src/landmark/features.js`). Frames without hands at the start and end of a clip are trimmed, and the clip is resampled to 48 frames. Coordinates are expressed relative to the signer: centred on the shoulder midpoint and scaled by shoulder width. Each hand is also described in its own frame (wrist at the origin), which captures handshape. Frame-to-frame motion is added, for 322 values per frame. The same code was used for training and is checked against the training features by a parity test (`npm run test:landmark`).
3. **Classifier.** A small 1D convolutional network (a dense stem, four residual Conv1D blocks with kernel size 5, then average and max pooling and a softmax over 50 signs), 714,034 parameters. It was trained with Keras on the CPU of an Apple M2 (4 to 16 minutes per run, depending on machine load) with random horizontal mirroring, rotation, scaling, temporal cropping and dropped hand frames as augmentation, then exported to TensorFlow.js with float16 weights (`public/landmark/models/include50/`, 1.46 MB).
4. **Captions.** On the webcam a sign is cut out of the stream by wrist height: it starts when a hand rises above the resting position (about 1.35 shoulder widths below the shoulders) and ends a few frames after the hands drop, and an interim guess is shown while the sign is in progress. Uploaded videos are analysed frame by frame at 25 fps and the whole clip is classified as one sign. English and Hindi captions come from `src/landmark/glosses.js`.

### Dataset and license

Trained and evaluated on **INCLUDE-50**, the 50-sign subset of INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition (Sridhar, Ganesan, Kumar and Khapra, ACM Multimedia 2020), recorded by deaf students of St. Louis School for the Deaf, Adyar, Chennai. The videos are from Zenodo record [4010759](https://zenodo.org/records/4010759) and the split from the [ai4bharat/INCLUDE](https://huggingface.co/datasets/ai4bharat/INCLUDE) metadata, both under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The videos themselves are not included in this repository.

The official split was used, with train and validation kept separate: 675 train, 77 validation and 191 test videos. The split is not signer-independent, because signer IDs are not published. A few metadata rows point at another class's video, so labels were taken from the class folder of each video. 15 videos in "Extra" folders have no split entry and were left out. The test split has no videos for two classes (House, dry), so test accuracy covers 48 of the 50 signs.

The MediaPipe models and runtime (`@mediapipe/tasks-vision`) are Apache 2.0.

### Results

Three seeds of the same recipe were trained, and the shipped model is the one with the best validation accuracy (seed 2, 98.7% on the 77 validation videos). The test split was not used for any choice. Accuracy on the 191 held-out INCLUDE-50 test videos:

| Model | Test top-1 | Test top-5 | Mirrored test top-1 | Mirrored test top-5 |
|---|---|---|---|---|
| Shipped model (seed 2, float16 weights) | 94.8% (181/191) | 99.5% | 93.2% (178/191) | 99.5% |
| Same recipe, 3 seeds | mean 94.8%, sd 1.6 (93.2 to 96.3) | mean 99.7% | mean 92.8%, sd 2.6 (90.1 to 95.3) | mean 99.5% |
| Without mirror augmentation (1 seed) | 97.9% | 100% | 35.6% | 52.9% |

"Mirrored" means every test video was flipped horizontally before landmark extraction, which simulates a left-handed signer. Without mirror augmentation the classifier fails on mirrored signing, so the shipped recipe gives up a little accuracy on the original videos in exchange for working with either dominant hand. Storing the weights as float16 left test accuracy unchanged. Most remaining errors are between signs with similar hand positions (Cell phone and Black, Dog and Store or Shop, Boy and Girl). For reference, the INCLUDE paper reports 94.5% on INCLUDE-50 with its best model; its test set has 192 videos, so the numbers are close but not strictly comparable.

**In the browser.** The shipped model was also run end to end in the app on all 191 test videos (re-encoded to 1280x720 MP4): 96.3% top-1 (184/191) and 100% top-5. Browser and offline predictions agreed on 185 of 191 videos; the small differences come from the GPU landmark models and the re-encoded video.

**Size and speed vs the YOLOv5l mode.** Measured in headed Google Chrome 156 (WebGL through ANGLE Metal) on an Apple M2 MacBook with 8 GB RAM, macOS 26.5.1, driven by Playwright against the Vite dev server. The live numbers use Chrome's fake webcam playing five INCLUDE-50 test clips at 1280x720 and 25 fps for 60 seconds (1,260 frames); the YOLOv5l numbers come from 60 frames of a test clip in the same browser, timed from preprocessing to reading back the detections. Other programs were running (load average about 12), so treat the timings as conservative.

| | Landmark mode (INCLUDE-50) | YOLOv5l mode |
|---|---|---|
| Model download | 30.2 MB in total: MediaPipe runtime 14.9 MB, hand model 7.8 MB, pose model 5.8 MB, classifier 1.46 MB, recognizer code 0.16 MB | 185.9 MB per language (weights and model.json) |
| Per-frame latency | median 37.5 ms, p95 57.1 ms (hand and pose landmarks) | median 748.3 ms, p95 969.1 ms (640x640 detection) |
| Per-sign classification | median 8.4 ms, p95 19.2 ms | not applicable |
| Frames per second | 22.0, measured live loop on a 25 fps camera | 1.3, from the median latency |

The first classification after a new video is loaded takes longer (0.2 to 0.7 s) while the GPU switches between MediaPipe and TensorFlow.js. The shared app bundle (React and TensorFlow.js, 1.95 MB) is the same for both modes and is not counted above.

### Hindi captions

The Hindi glosses in `src/landmark/glosses.js` are plain translations of the English class names. Entries marked `review: true` (Fall, Paint, it, loud, short, small or little, you plural) depend on which sense of the word the sign carries and should be confirmed by an ISL user. Short and Small / little currently share the caption छोटा.

## Dataset (YOLOv5 mode)

The training images were collected and labeled by the project team and are published on Roboflow Universe as [Multilingual sign language detection](https://universe.roboflow.com/project-eynha/multilingual-sign-language-detection) (workspace `project-eynha`, 2,588 images, 51 classes), with a Hindi-labeled copy as [Hindi](https://universe.roboflow.com/project-eynha/hindi-qxu5c). The dataset is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Note on the model files: `public/hindi_web_model` is a second export of the same trained network as `public/english_web_model` (identical graph, weights equal to within 2.4e-7, identical predictions on the test frames). The app therefore loads only `english_web_model` and shows Hindi by translating the class labels in `src/utils/labelsHindi.json`, whose order matches the model's class indices.

## Credits and license

This app started from the [yolov5-tfjs](https://github.com/Hyuto/yolov5-tfjs) template by Wahyu Setianto, which is released under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

This project is also distributed under the MIT License (see `package.json`). The bounding box color palette comes from [Ultralytics](https://ultralytics.com/).
