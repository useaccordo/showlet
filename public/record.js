const $ = (s) => document.querySelector(s),
  ui = {
    start: $("#start"),
    pause: $("#pause"),
    stop: $("#stop"),
    status: $("#status"),
    timer: $("#timer"),
    preview: $("#preview"),
    progress: $("#progress"),
    title: $("#title"),
  };
const review = $("#publish-form"),
  publish = $("#publish"),
  protect = $("#protect-video"),
  passcode = $("#publish-passcode");
let draft = false,
  audioCapture,
  generating = false,
  generationController,
  suggestedTitle = "";
let recorder,
  screen,
  mic,
  mixer,
  mixed,
  chunks = [],
  thumbnail,
  blob,
  duration = 0,
  startAt = 0,
  pausedAt = 0,
  pausedTotal = 0,
  clock,
  busy = false,
  lastSession;
const max = Number($("#recorder").dataset.maxDuration),
  maxBytes = Number($("#recorder").dataset.maxBytes);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, data) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Showlet-Request": "1" },
    body: JSON.stringify(data),
  });
  let b;
  try {
    b = await r.json();
  } catch {
    throw Error("Your session may have expired. Sign in again, then retry.");
  }
  if (!r.ok) throw Error(b.error || "Request failed");
  return b;
}
function release() {
  audioCapture?.stop();
  clearInterval(clock);
  $("#countdown").textContent = "";
  $("#countdown").classList.remove("recording-badge");
  screen?.getTracks().forEach((t) => t.stop());
  mic?.getTracks().forEach((t) => t.stop());
  mixed?.getTracks().forEach((t) => t.stop());
  mixer?.close();
  ui.start.textContent = "Enable microphone";
  ui.preview.srcObject = null;
}
// Monitor-only cues: never connect these to the recording's audio destination.
function recordingCue(frequency, length = 0.1) {
  if (mixer?.state !== "running") return;
  const tone = mixer.createOscillator(),
    gain = mixer.createGain();
  const now = mixer.currentTime;
  tone.frequency.value = frequency;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + length);
  tone.connect(gain).connect(mixer.destination);
  tone.start(now);
  tone.stop(now + length + 0.02);
  tone.onended = () => {
    tone.disconnect();
    gain.disconnect();
  };
}
function seconds() {
  return ((pausedAt || performance.now()) - startAt - pausedTotal) / 1000;
}
function stop() {
  if (recorder && ["recording", "paused"].includes(recorder.state)) {
    duration = Math.min(seconds(), max);
    audioCapture?.stop();
    recorder.stop();
    ui.stop.disabled = ui.pause.disabled = true;
  }
}
function takeThumbnail() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = Math.round(
    (960 * (ui.preview.videoHeight || 9)) / (ui.preview.videoWidth || 16),
  );
  canvas
    .getContext("2d")
    .drawImage(ui.preview, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
}
function put(url, data, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onerror = () =>
      reject(
        Error(
          "Upload interrupted. Your recording is available to download or retry.",
        ),
      );
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag"))
        : reject(Error("Upload failed. Please retry."));
    xhr.send(data);
  });
}
async function upload() {
  if (busy || generating || !draft) return;
  const options = {
    title: ui.title.value.trim(),
    passcode: protect.checked ? passcode.value : null,
    publicAcknowledged: $("#public-acknowledged").checked,
    transcript:
      !$("#transcript-review").hidden && $("#include-transcript").checked
        ? $("#transcript-text").value
        : null,
  };
  if (
    !options.title ||
    /^[\d\s/.,:\-]+(?:[ap]\.?m\.?)?$/i.test(options.title)
  ) {
    ui.title.setCustomValidity(
      "Give your recording a descriptive title instead of a date and time.",
    );
    ui.title.reportValidity();
    return;
  }
  if (!protect.checked && !options.publicAcknowledged) {
    $("#public-acknowledged").reportValidity();
    ui.status.textContent =
      "Add a passcode or acknowledge that anyone with the link can watch.";
    return;
  }
  if (!review.reportValidity()) return;
  busy = true;
  for (const field of review.elements) field.disabled = true;
  $("#retry").hidden = true;
  ui.progress.hidden = false;
  ui.progress.value = 0;
  ui.status.textContent = "Uploading your recording…";
  try {
    const mime = blob.type.startsWith("video/mp4") ? "video/mp4" : "video/webm";
    if (lastSession)
      try {
        await api("/api/uploads/" + lastSession + "/abort", {});
      } catch {}
    const session = await api("/api/uploads", {
      title: options.title,
      passcode: options.passcode,
      publicAcknowledged: options.publicAcknowledged,
      transcript: options.transcript,
      mime,
      size: blob.size,
      duration,
    });
    lastSession = session.id;
    await put(session.thumbnailUrl, thumbnail, () => {});
    let sent = 0,
      parts = [];
    if (session.multipart) {
      for (let n = 1; n <= session.parts; n++) {
        const part = blob.slice(
            (n - 1) * session.partSize,
            n * session.partSize,
          ),
          { url } = await api(`/api/uploads/${session.id}/parts`, { part: n });
        const etag = await put(
          url,
          part,
          (loaded) => (ui.progress.value = (100 * (sent + loaded)) / blob.size),
        );
        if (!etag) throw Error("R2 CORS must expose ETag.");
        parts.push({ partNumber: n, etag });
        sent += part.size;
      }
    } else
      await put(
        session.uploadUrl,
        blob,
        (loaded) => (ui.progress.value = (100 * loaded) / blob.size),
      );
    const result = await api(`/api/uploads/${session.id}/complete`, { parts });
    lastSession = null;
    draft = false;
    audioCapture = null;
    review.hidden = true;
    passcode.value = "";
    ui.progress.value = 100;
    $("#share").href = result.url;
    $("#share").textContent = result.url;
    $("#result").hidden = false;
    $("#manage-recording").href = result.url.replace("/v/", "/library/");
    $("#manage-recording").hidden = false;
    ui.status.textContent = "Ready to share.";
    try {
      await navigator.clipboard.writeText(
        `Watch this Showlet recording:\n\n${options.title}\n\nVideo: ${result.url}${options.passcode ? `\n\nPasscode: ${options.passcode}\nEnter this passcode when prompted to watch.` : ""}`,
      );
      ui.status.textContent = options.passcode
        ? "Link and passcode copied together. Anyone receiving these details can watch."
        : "Ready to share. Link copied.";
    } catch {
      ui.status.textContent = "Ready to share. Use Copy link below.";
    }
  } catch (e) {
    ui.status.textContent = e.message;
    publish.textContent = "Retry publish";
  } finally {
    busy = false;
    for (const field of review.elements) field.disabled = false;
    passcode.disabled = !protect.checked;
    ui.start.disabled = draft;
  }
}
async function checkPlayback(file) {
  const video = document.createElement("video"),
    url = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            Error(
              "Video metadata could not be verified. Download the recording before trying again.",
            ),
          ),
        15000,
      );
      const fail = () => {
        clearTimeout(timeout);
        reject(
          Error(
            "The browser could not read this recording. Download it before trying again.",
          ),
        );
      };
      video.onerror = fail;
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          fail();
          return;
        }
        const target = Math.min(
          video.duration * 0.75,
          Math.max(0, video.duration - 0.25),
        );
        video.onseeked = () => {
          clearTimeout(timeout);
          resolve();
        };
        if (target === 0) {
          clearTimeout(timeout);
          resolve();
        } else video.currentTime = target;
      };
      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
async function finish() {
  draft = true;
  release();
  blob = new Blob(chunks, { type: recorder.mimeType });
  chunks = [];
  ui.status.textContent = "Preparing video…";
  try {
    if (blob.type.startsWith("video/webm")) {
      await new Promise((resolve, reject) => {
        if (window.ysFixWebmDuration) return resolve();
        const script = document.createElement("script");
        script.src = "/vendor/fix-webm-duration.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      blob = await new Promise((resolve) =>
        window.ysFixWebmDuration(blob, duration * 1000, resolve, {
          logger: false,
        }),
      );
    }
    const link = $("#download");
    if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
    link.href = URL.createObjectURL(blob);
    link.download =
      "showlet-recording." +
      (blob.type.startsWith("video/mp4") ? "mp4" : "webm");
    link.hidden = false;
    if (blob.size > maxBytes)
      throw Error(
        "Recording exceeds the upload limit. Download it and record a shorter video.",
      );
    if (!thumbnail)
      throw Error(
        "No thumbnail captured. Download your recording and retry recording.",
      );
    await checkPlayback(blob);
    ui.preview.autoplay = false;
    ui.preview.controls = true;
    ui.preview.muted = false;
    ui.preview.src = link.href;
    review.hidden = false;
    ui.status.textContent =
      "Ready to review. Add a title and optional passcode, then publish.";
    ui.title.focus();
  } catch (e) {
    ui.status.textContent = e.message || "Could not prepare the recording.";
    ui.start.disabled = false;
  }
}
ui.start.onclick = async () => {
  if (!mic?.getAudioTracks().some((track) => track.readyState === "live")) {
    ui.start.disabled = true;
    ui.status.textContent =
      "Allow microphone access here before choosing a screen.";
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      ui.start.textContent = "Choose screen & record";
      ui.status.textContent =
        "Microphone ready. Click Choose screen & record, then select what to share. Listen for the start chime.";
    } catch {
      ui.status.textContent =
        "Microphone access is needed. Allow it in your browser, then try again.";
    } finally {
      ui.start.disabled = false;
    }
    return;
  }

  if (draft && !confirm("Discard the unpublished recording and start again?"))
    return;
  draft = false;
  audioCapture = null;
  suggestedTitle = "";
  $("#transcript-review").hidden = true;
  $("#transcript-text").value = "";
  $("#title-suggestion").hidden = true;
  $("#public-acknowledged").checked = false;
  $("#public-acknowledged").required = true;
  $("#public-warning").hidden = false;
  $("#ai-status").textContent = "";
  $("#generate-transcript").textContent = "Generate transcript & suggest title";
  review.hidden = true;
  ui.title.value = "";
  ui.title.setCustomValidity("");
  protect.checked = false;
  passcode.value = "";
  passcode.disabled = true;
  passcode.required = false;
  $("#passcode-options").hidden = true;
  publish.textContent = "Publish video";
  ui.preview.removeAttribute("src");
  ui.preview.controls = false;
  ui.preview.muted = true;
  ui.preview.autoplay = true;
  ui.progress.hidden = true;
  $("#download").hidden = true;
  ui.start.disabled = true;
  $("#result").hidden = true;
  $("#retry").hidden = true;
  thumbnail = null;
  chunks = [];
  pausedAt = pausedTotal = 0;
  try {
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder)
      throw Error("Use a desktop browser with screen recording support.");
    mixer = new AudioContext();
    const audioReady = mixer.resume();
    ui.status.textContent =
      "Choose a screen. Listen for three beeps, then the recording start chime.";
    screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    await audioReady;
    const dest = mixer.createMediaStreamDestination();
    for (const stream of [screen, mic])
      if (stream.getAudioTracks().length)
        mixer
          .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
          .connect(dest);
    mixed = new MediaStream([
      ...screen.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    ui.preview.srcObject = screen;
    await ui.preview.play();
    thumbnail = await takeThumbnail();
    for (let n = 3; n > 0; n--) {
      if (screen.getVideoTracks()[0].readyState !== "live")
        throw Error("Screen sharing ended.");
      $("#countdown").textContent = n;
      ui.status.textContent = `Recording starts in ${n}…`;
      recordingCue(520);
      await sleep(1000);
    }
    $("#countdown").textContent = "";
    const mime = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) throw Error("No supported recording format.");
    recorder = new MediaRecorder(mixed, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000,
    });
    let bytes = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > maxBytes) stop();
      }
    };
    recorder.onstop = finish;
    recorder.onerror = () => {
      ui.status.textContent = "Recording error. Stopping…";
      stop();
    };
    screen.getVideoTracks()[0].onended = stop;
    try {
      audioCapture = new window.ShowletTranscription(mixed);
    } catch {
      audioCapture = null;
    }
    recorder.onstart = () => {
      startAt = performance.now();
      recordingCue(1040, 0.35);
      $("#countdown").classList.add("recording-badge");
      $("#countdown").textContent = "● Recording";
      ui.timer.textContent = "00:00";
      ui.pause.disabled = ui.stop.disabled = false;
      ui.pause.textContent = "Pause";
      ui.status.textContent = "Recording. You can pause whenever you need.";
      clock = setInterval(() => {
        const sec = seconds();
        ui.timer.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
        if (sec >= max) stop();
      }, 200);
    };
    recorder.start(1000);
    await sleep(1500);
    if (recorder.state !== "inactive") thumbnail = await takeThumbnail();
  } catch (e) {
    $("#countdown").textContent = "";
    release();
    ui.status.textContent = e.message;
    ui.start.disabled = false;
  }
};
ui.pause.onclick = () => {
  if (recorder.state === "recording") {
    pausedAt = performance.now();
    recorder.pause();
    audioCapture?.pause();
    ui.pause.textContent = "Resume";
    ui.status.textContent = "Paused.";
    $("#countdown").textContent = "Paused";
  } else if (recorder.state === "paused") {
    pausedTotal += performance.now() - pausedAt;
    pausedAt = 0;
    recorder.resume();
    audioCapture?.resume();
    ui.pause.textContent = "Pause";
    ui.status.textContent = "Recording.";
    $("#countdown").textContent = "● Recording";
  }
};
ui.stop.onclick = stop;
review.onsubmit = (event) => {
  event.preventDefault();
  upload();
};
ui.title.oninput = () => ui.title.setCustomValidity("");
protect.onchange = () => {
  $("#passcode-options").hidden = !protect.checked;
  passcode.disabled = !protect.checked;
  passcode.required = protect.checked;
  $("#public-warning").hidden = protect.checked;
  $("#public-acknowledged").required = !protect.checked;
  $("#public-acknowledged").checked = false;
  if (protect.checked) passcode.focus();
};
$("#discard").onclick = () => {
  if (busy || generating || !confirm("Discard this unpublished recording?"))
    return;
  draft = false;
  audioCapture = null;
  blob = null;
  thumbnail = null;
  review.hidden = true;
  passcode.value = "";
  ui.preview.removeAttribute("src");
  ui.preview.load();
  const link = $("#download");
  if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
  link.removeAttribute("href");
  link.hidden = true;
  ui.progress.hidden = true;
  ui.start.disabled = false;
  ui.status.textContent = "Ready for a new recording.";
};
$("#retry").onclick = () => review.requestSubmit();
$("#copy").onclick = () =>
  window.copyVideoShare($("#share").href.split("/").pop(), ui.status);

window.addEventListener("beforeunload", (e) => {
  if (draft || busy || (recorder && recorder.state !== "inactive")) {
    e.preventDefault();
    e.returnValue = "";
  }
});

$("#generate-transcript").onclick = async () => {
  if (busy || generating || !draft) return;
  const status = $("#ai-status");
  if (!audioCapture) {
    status.textContent =
      "Audio transcription isn’t available for this recording. Enter a title to continue.";
    return;
  }
  generating = true;
  generationController = new AbortController();
  $("#generate-transcript").disabled = true;
  $("#cancel-generation").hidden = false;
  publish.disabled = $("#discard").disabled = true;
  try {
    const transcript = !$("#transcript-review").hidden
      ? $("#transcript-text").value
      : await audioCapture.transcribe(
          (text) => (status.textContent = text),
          generationController.signal,
        );
    generationController.signal.throwIfAborted();
    if (!transcript)
      throw Error("No speech was detected. Please enter a title yourself.");
    $("#transcript-text").value = transcript;
    $("#transcript-review").hidden = false;
    status.textContent = "Transcript ready. Suggesting a title…";
    const response = await fetch("/api/suggest-title", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Showlet-Request": "1" },
      body: JSON.stringify({ transcript }),
      signal: generationController.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error(
        "Your session may have expired. Sign in again and retry the title suggestion.",
      );
    }
    if (!response.ok)
      throw Error(result.error || "Please enter a title yourself.");
    if (!ui.title.value.trim() || ui.title.value === suggestedTitle) {
      ui.title.value = result.title;
      ui.title.setCustomValidity("");
    }
    suggestedTitle = result.title;
    $("#suggested-title").textContent = "Suggested title: " + suggestedTitle;
    $("#title-suggestion").hidden = false;
    status.textContent =
      "Ready. Review the transcript and reword the title as needed.";
    $("#generate-transcript").textContent = "Suggest title again";
  } catch (e) {
    status.textContent =
      e.name === "AbortError"
        ? "Generation cancelled. You can retry or enter a title yourself."
        : e.message;
    $("#generate-transcript").textContent = "Retry transcript / title";
  } finally {
    generating = false;
    $("#generate-transcript").disabled = false;
    $("#cancel-generation").hidden = true;
    publish.disabled = $("#discard").disabled = false;
  }
};
$("#cancel-generation").onclick = () => generationController?.abort();
$("#use-suggestion").onclick = () => {
  ui.title.value = suggestedTitle;
  ui.title.setCustomValidity("");
  ui.title.focus();
};
