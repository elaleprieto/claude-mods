// The program that shows a picture in a window of its own, by the pointer, outside the terminal:
// JavaScript for Automation, run by `osascript`, drawing an AppKit panel. Taken from midudev's
// better-claude image-preview (MIT). It reads IMAGE_PREVIEW_FILE, the picture; IMAGE_PREVIEW_SIZE,
// its longest side at most; IMAGE_PREVIEW_LIFE, how many seconds at most it stays. It writes `shown`
// once the window is up, or a line starting `error`, then a `.` every tenth of a second, so the one
// reading it is woken to end it, and it ends when nobody reads. The window never takes the focus or
// the pointer: the terminal keeps both.

export const MACOS = String.raw`
ObjC.import('Cocoa')

function run () {
  const env = $.NSProcessInfo.processInfo.environment
  const read = key => { const value = env.objectForKey(key); return value.isNil() ? '' : ObjC.unwrap(value) }
  const say = text => $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
  const largest = Number(read('IMAGE_PREVIEW_SIZE')) || 800
  // An accessory app: no Dock icon, never the active one.
  $.NSApplication.sharedApplication.setActivationPolicy(1)
  const image = $.NSImage.alloc.initWithContentsOfFile(read('IMAGE_PREVIEW_FILE'))
  if (image.isNil() || image.representations.count === 0) { say('error: cannot read the image'); return }
  const pixels = image.representations.firstObject
  const mouse = $.NSEvent.mouseLocation
  const screens = $.NSScreen.screens
  let screen = $.NSScreen.mainScreen
  for (let i = 0; i < screens.count; i++) {
    const frame = screens.objectAtIndex(i).frame
    if (mouse.x >= frame.origin.x && mouse.x < frame.origin.x + frame.size.width && mouse.y >= frame.origin.y && mouse.y < frame.origin.y + frame.size.height) screen = screens.objectAtIndex(i)
  }
  const area = screen.visibleFrame
  let width = pixels.pixelsWide / screen.backingScaleFactor
  let height = pixels.pixelsHigh / screen.backingScaleFactor
  const fit = Math.min(1, largest / Math.max(width, height), (area.size.width * 0.7) / width, (area.size.height * 0.7) / height)
  width = Math.round(width * fit)
  height = Math.round(height * fit)
  const pad = 6
  const gap = 18
  const outer = { width: width + pad * 2, height: height + pad * 2 }
  const top = area.origin.y + area.size.height
  const right = area.origin.x + area.size.width
  // Above the pointer and to its right; under it, or to its left, where there is no room: never
  // over the pointer, which stays on the terminal.
  let x = mouse.x + gap
  let y = mouse.y + gap
  if (y + outer.height > top) y = mouse.y - gap - outer.height
  if (x + outer.width > right) x = mouse.x - gap - outer.width
  x = Math.max(area.origin.x, Math.min(x, right - outer.width))
  y = Math.max(area.origin.y, Math.min(y, top - outer.height))
  // Borderless and non-activating; over every app window, on every space, full-screen ones too.
  const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(x, y, outer.width, outer.height), 128, 2, false)
  panel.level = 25
  panel.ignoresMouseEvents = true
  panel.hasShadow = true
  panel.opaque = false
  panel.backgroundColor = $.NSColor.clearColor
  panel.collectionBehavior = 1 | 16 | 256
  const backdrop = $.NSVisualEffectView.alloc.initWithFrame($.NSMakeRect(0, 0, outer.width, outer.height))
  backdrop.material = 13
  backdrop.state = 1
  backdrop.wantsLayer = true
  backdrop.layer.cornerRadius = 10
  backdrop.layer.masksToBounds = true
  const view = $.NSImageView.alloc.initWithFrame($.NSMakeRect(pad, pad, width, height))
  view.image = image
  view.imageScaling = 3
  backdrop.addSubview(view)
  panel.contentView = backdrop
  panel.orderFrontRegardless
  say('shown')
  const end = Date.now() + (Number(read('IMAGE_PREVIEW_LIFE')) || 120) * 1000
  while (Date.now() < end) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1))
    say('.')
  }
}
`
