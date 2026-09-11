/* Capture a small audio-only file; decode/resample locally only when requested. */
window.ShowletTranscription = class {
  constructor(stream) {
    this.parts = [];
    this.texts = [];
    this.audio = null;
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    if (!mime)
      throw Error("Audio transcription is not supported in this browser.");
    this.recorder = new MediaRecorder(
      new MediaStream(stream.getAudioTracks()),
      { mimeType: mime, audioBitsPerSecond: 64000 },
    );
    this.ready = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.parts.push(e.data);
    };
    this.recorder.onstop = () => {
      this.audio = new Blob(this.parts, { type: this.recorder.mimeType });
      this.parts = [];
      this.resolve();
    };
    this.recorder.onerror = () => {
      this.failed = true;
      this.resolve();
    };
    this.recorder.start(1000);
  }
  static fromFile(file) {
    const capture = Object.create(this.prototype);
    capture.audio = file;
    capture.texts = [];
    capture.ready = Promise.resolve();
    return capture;
  }
  pause() {
    if (this.recorder.state === "recording") this.recorder.pause();
  }
  resume() {
    if (this.recorder.state === "paused") this.recorder.resume();
  }
  stop() {
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    return this.ready;
  }
  async transcribe(update, signal) {
    await this.stop();
    if (this.failed || !this.audio?.size)
      throw Error(
        "No separate audio was captured. You can still enter a title and publish.",
      );
    if (!this.samples) {
      update("Preparing audio…");
      const context = new AudioContext({ sampleRate: 16000 });
      try {
        const decoded = await context.decodeAudioData(
          await this.audio.arrayBuffer(),
        );
        if (decoded.duration > 902 || decoded.sampleRate !== 16000)
          throw Error("Audio could not be prepared for transcription.");
        this.samples = new Float32Array(decoded.length);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const data = decoded.getChannelData(channel);
          for (let i = 0; i < data.length; i++)
            this.samples[i] += data[i] / decoded.numberOfChannels;
        }
      } finally {
        await context.close();
      }
    }
    const count = Math.ceil(this.samples.length / 480000);
    for (let n = this.texts.length; n < count; n++) {
      signal.throwIfAborted();
      update(`Transcribing audio ${n + 1} of ${count}…`);
      const samples = this.samples.subarray(
        n * 480000,
        Math.min((n + 1) * 480000, this.samples.length),
      );
      const wav = window.ShowletTranscription.wav(samples);
      const r = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "X-Showlet-Request": "1" },
        body: wav,
        signal,
      });
      let result;
      try {
        result = await r.json();
      } catch {
        throw Error("Your session may have expired. Sign in again and retry.");
      }
      if (!r.ok)
        throw Error(
          result.error ||
            "Transcription failed. Retry or enter a title yourself.",
        );
      this.texts.push(result.text);
    }
    return window.ShowletTranscription.format(this.texts);
  }
  static format(chunks) {
    let words = [];
    const normalize = (word) =>
      word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    for (const chunk of chunks) {
      const next = chunk.trim().split(/\s+/).filter(Boolean);
      let overlap = 0;
      for (
        let size = Math.min(20, words.length, next.length);
        size >= 4;
        size--
      ) {
        if (
          words
            .slice(-size)
            .every((word, index) => normalize(word) === normalize(next[index]))
        ) {
          overlap = size;
          break;
        }
      }
      words.push(...next.slice(overlap));
    }
    const sentences =
      words.join(" ").match(/[^.!?]+(?:[.!?]+(?:["”’])?(?=\s|$)|$)/g) || [];
    const paragraphs = [];
    let paragraph = "";
    for (const sentence of sentences) {
      paragraph += (paragraph ? " " : "") + sentence.trim();
      if (paragraph.length >= 450 && /[.!?]["”’]?$/.test(paragraph)) {
        paragraphs.push(paragraph);
        paragraph = "";
      }
    }
    if (paragraph) paragraphs.push(paragraph);
    return paragraphs.join("\n\n");
  }
  static wav(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2),
      view = new DataView(buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, buffer.byteLength - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }
};
