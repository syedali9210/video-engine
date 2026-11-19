// Per-frame motion measurements of a reference video, motiscope's method (github.com/KumarSashank/motiscope, MIT) on
// macOS's own AVFoundation, so it needs no ffmpeg: every frame decoded and reduced to a 32x32 grey thumbnail; energy =
// mean |diff| to the frame before (0-255); localized energy = the mean of the most active 10% of an 8x8 grid's cells
// (one small element moving isn't averaged away); plus mean luma, mean colour and a 3x3 colour grid (the scene's
// colour). One CSV line a frame, to stdout. Run by scripts/measure.mjs (`npm run measure -- <video>`).
//   swift -O scripts/motion/measure.swift <video> > frames.csv
import AVFoundation
import CoreVideo
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
func run() async throws {
  let track = try await asset.loadTracks(withMediaType: .video)[0]
  let reader = try AVAssetReader(asset: asset)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  out.alwaysCopiesSampleData = false
  reader.add(out)
  reader.startReading()
  var prev: [Double]? = nil
  print("t,energy,local,yavg,r,g,b,grid")
  let N = 32
  while let sb = out.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var thumb = [Double](repeating: 0, count: N * N)
    var rgb = [Double](repeating: 0, count: N * N * 3)
    for by in 0..<N { for bx in 0..<N {
      var s = 0.0, rs = 0.0, gs = 0.0, bs = 0.0, n = 0.0
      let x0 = bx * w / N, x1 = (bx + 1) * w / N, y0 = by * h / N, y1 = (by + 1) * h / N
      var y = y0 + 1
      while y < y1 { var x = x0 + 1
        while x < x1 { let p = base + y * bpr + x * 4
          let b = Double(p[0]), g = Double(p[1]), r = Double(p[2])
          s += 0.299 * r + 0.587 * g + 0.114 * b; rs += r; gs += g; bs += b; n += 1; x += 6 }
        y += 6 }
      thumb[by * N + bx] = s / max(1, n); rgb[(by * N + bx) * 3] = rs / max(1, n); rgb[(by * N + bx) * 3 + 1] = gs / max(1, n); rgb[(by * N + bx) * 3 + 2] = bs / max(1, n)
    } }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    var energy = 0.0, local = 0.0
    if let p = prev {
      var cells = [Double](repeating: 0, count: 64)
      for i in 0..<(N * N) { let d = abs(thumb[i] - p[i]); energy += d; cells[(i / N) / 4 * 8 + (i % N) / 4] += d / 16 }
      energy /= Double(N * N)
      let top = cells.sorted(by: >).prefix(7); local = top.reduce(0, +) / Double(top.count)
    }
    prev = thumb
    let yavg = thumb.reduce(0, +) / Double(N * N)
    var R = 0.0, G = 0.0, B = 0.0
    for i in 0..<(N * N) { R += rgb[i * 3]; G += rgb[i * 3 + 1]; B += rgb[i * 3 + 2] }
    R /= Double(N * N); G /= Double(N * N); B /= Double(N * N)
    var grid: [String] = []
    for gy in 0..<3 { for gx in 0..<3 {
      var r = 0.0, g = 0.0, b = 0.0, n = 0.0
      for y in (gy * N / 3)..<((gy + 1) * N / 3) { for x in (gx * N / 3)..<((gx + 1) * N / 3) { let i = y * N + x; r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; n += 1 } }
      grid.append(String(format: "%02x%02x%02x", Int(r / n), Int(g / n), Int(b / n)))
    } }
    print(String(format: "%.4f,%.3f,%.3f,%.1f,%.0f,%.0f,%.0f,", t, energy, local, yavg, R, G, B) + grid.joined(separator: " "))
  }
}
Task { do { try await run() } catch { FileHandle.standardError.write("error \(error)\n".data(using: .utf8)!); exit(1) }; sem.signal() }
sem.wait()
