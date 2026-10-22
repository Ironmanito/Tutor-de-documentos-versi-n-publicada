export class AudioStreamPlayer {
  private context: AudioContext | null = null;
  private nextTime: number = 0;
  private sampleRate: number;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
    try {
      this.context = new AudioContext({ sampleRate });
      this.nextTime = this.context.currentTime;
    } catch (err) {
      console.warn("Failed to initialize AudioContext:", err);
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: this.sampleRate });
      this.nextTime = this.context.currentTime;
    }
    return this.context;
  }

  addPCM16(base64: string) {
    try {
      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32Array.length, ctx.sampleRate);
      buffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      if (this.nextTime < ctx.currentTime) {
        this.nextTime = ctx.currentTime;
      }
      source.start(this.nextTime);
      this.nextTime += buffer.duration;
    } catch (err) {
      console.warn("Error playing PCM16 chunk:", err);
    }
  }

  isPlaying(): boolean {
    if (!this.context || this.context.state === 'closed') return false;
    return this.nextTime > this.context.currentTime + 0.05;
  }

  interrupt() {
    try {
      if (this.context && this.context.state !== 'closed') {
        this.context.close().catch(() => {});
      }
    } catch (_) {}
    try {
      this.context = new AudioContext({ sampleRate: this.sampleRate });
      this.nextTime = this.context.currentTime;
    } catch (err) {
      console.warn("Error re-initializing AudioContext in interrupt:", err);
    }
  }

  stop() {
    try {
      if (this.context && this.context.state !== 'closed') {
        this.context.close().catch(() => {});
      }
    } catch (_) {}
    this.context = null;
  }
}

export class AudioRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private smoothedVolume: number = 0;
  private isStopped: boolean = false;
  private hangoverFrames: number = 0;
  private hadSpeechInTurn: boolean = false;
  private preRollBase64: string | null = null;
  private silenceFrameBase64: string = '';

  constructor(
    private onData: (base64: string) => void,
    private onVolume?: (volume: number) => void,
    private onSpeechEnd?: () => void
  ) {
    // Pre-compute a 4096-sample pure digital silence frame
    const zeroBytes = new Uint8Array(4096 * 2);
    let bin = '';
    for (let i = 0; i < zeroBytes.byteLength; i++) {
      bin += String.fromCharCode(0);
    }
    this.silenceFrameBase64 = btoa(bin);
  }

  async start() {
    this.isStopped = false;
    this.hangoverFrames = 0;
    this.hadSpeechInTurn = false;
    this.preRollBase64 = null;
    this.stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    if (this.isStopped) {
      this.stream.getTracks().forEach(t => t.stop());
      return;
    }
    this.context = new AudioContext({ sampleRate: 16000 });
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    if (this.isStopped) {
      if (this.context.state !== 'closed') {
        this.context.close().catch(() => {});
      }
      return;
    }
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (this.isStopped) return;
      if (this.context && this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      let sumSquares = 0;

      for (let i = 0; i < inputData.length; i++) {
        const val = inputData[i];
        sumSquares += val * val;
        let s = Math.max(-1, Math.min(1, val));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Calculate instantaneous RMS volume
      const rms = Math.sqrt(sumSquares / inputData.length);
      // Amplify and clamp between 0 and 1
      const instantVol = Math.min(1, Math.max(0, rms * 6.5));
      // Smooth volume transition for natural UI animations
      this.smoothedVolume = this.smoothedVolume * 0.35 + instantVol * 0.65;
      
      if (this.onVolume) {
        this.onVolume(this.smoothedVolume);
      }

      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const frameBase64 = btoa(binary);

      // Voice Activity Detection with Noise Gate & Clean Silence Squelch
      const isVoiceActive = rms > 0.0085;
      if (isVoiceActive) {
        if (!this.hadSpeechInTurn && this.preRollBase64) {
          this.onData(this.preRollBase64);
        }
        this.hadSpeechInTurn = true;
        this.hangoverFrames = 5; // ~1.28s hangover after speech stops
        this.onData(frameBase64);
      } else if (this.hangoverFrames > 0) {
        this.hangoverFrames--;
        // Send pure digital silence during tail so server VAD cleanly detects end-of-turn
        this.onData(this.silenceFrameBase64);
        if (this.hangoverFrames === 0 && this.hadSpeechInTurn) {
          this.hadSpeechInTurn = false;
          if (this.onSpeechEnd) {
            this.onSpeechEnd();
          }
        }
      } else {
        // Store pre-roll frame so the very start of next utterance is never clipped
        this.preRollBase64 = frameBase64;
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  stop() {
    this.isStopped = true;
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach(t => t.stop());
      if (this.context && this.context.state !== 'closed') {
        this.context.close().catch(() => {});
      }
    } catch (_) {}
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
    if (this.onVolume) {
      this.onVolume(0);
    }
  }
}
