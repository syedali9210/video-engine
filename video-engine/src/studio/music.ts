// A song, read in the browser: decoded, its loudness rise frame by frame (where notes and hits start), and from that its
// tempo, its beats and its loudest hits (story.ts beatsOf). The film is cut on them; the export ends the song on a bar.
import { beatsOf } from "./story"

export async function analyseSong(file: Blob): Promise<{ duration: number; bpm: number; beats: number[]; hits: number[] }> {
  const ctx = new OfflineAudioContext(1, 1, 44100)
  const audio = await ctx.decodeAudioData(await file.arrayBuffer())
  const rate = audio.sampleRate
  // the channels together, then the energy in 1024-sample windows every 512 (about 12 ms)
  const n = audio.length
  const mono = new Float32Array(n)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels
  }
  const hop = 512
  const energy: number[] = []
  for (let i = 0; i + 1024 < n; i += hop) {
    let e = 0
    for (let j = i; j < i + 1024; j++) e += mono[j] * mono[j]
    energy.push(Math.log1p(e * 1000))
  }
  // onset strength: how much louder each window is than the one before
  const onset = energy.map((e, i) => Math.max(0, e - (energy[i - 1] ?? e)))
  return { duration: audio.duration, ...beatsOf(onset, hop / rate) }
}
