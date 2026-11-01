# Delivered release APK check

This separate instrumentation application tests an already-built `com.tingwu.mobile` APK.
It includes its own AndroidX Test libraries, so it does not require changing the production
APK's shrinker rules or enabling WebView debugging. Sign it with the same certificate as
the release APK. It has no launcher entry and is not part of the user installation package.

Run only in an isolated emulator with no account data and host microphone input disabled.
The shared test requires a fresh installation without microphone permission already granted.
It intercepts all website requests and never initializes the website application or creates
a cloud meeting. The input is the emulator's silent microphone.

Download the current official application bundle and its public Opus worker into a temporary
directory. For the verified 2026-11-01 deployment, these are:

- `https://g.alicdn.com/idst-fe/mind-meeting-assistant2/0.1.32/umi.js`
- `https://tingwu.aliyun.com/public/opusEncoderWorker.js`

From the repository root, stage these files:

```powershell
node scripts/prepare-official-recorder.cjs <path-to-umi.js> <path-to-worker.js> <staging-directory>
```

The preparation script disables application bootstrap and exposes only the runtime module
loader for the test. It records source URLs and SHA-256 hashes. Generated official code stays
in the temporary directory, outside the repository and the production APK.

Set the existing `TINGWU_KEYSTORE_PATH`, `TINGWU_KEYSTORE_PASSWORD`, and `TINGWU_KEY_ALIAS`
signing environment variables, then build:

```powershell
.\gradlew.bat -p scripts/release-harness -PtingwuRecorderTestAssets=<absolute-staging-directory> assembleDebug --no-daemon
```

Install the delivered release APK and then install the generated harness APK with `adb install -t`.
Use an explicit emulator serial for every ADB command. The runner is:

```text
com.tingwu.mobile.harness/androidx.test.runner.AndroidJUnitRunner
```

Pass `-e class com.tingwu.mobile.RecordingMicrophoneTest -e officialEncoder true` to
`adb shell am instrument -w`. The check covers system permission, microphone preflight,
repeated MediaRecorder capture, a real click on the start control, twenty seconds of the
official uFvF/iHlY Opus encoder, pause/release, resume, and stop/release. Only counts and byte
lengths are logged with the `TingwuRecorderTest` tag; no audio is sent to a service.

On Android 15 / WebView 124.0.6367.219, the delivered 1.0.10 APK passed this check on
2026-11-01: 224 Ogg/Opus pages, 16,935 bytes, and no encoder error. Its APK SHA-256 remained
`9E822ED0BE7B1310902D764FBD7E309392622FB7905BE1C7D7BE43B5622CE2D4`.

This does not test real Xiaomi microphone hardware, account login, cloud upload, or live
transcription under a real account.
