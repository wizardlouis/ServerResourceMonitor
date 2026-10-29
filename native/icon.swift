import AppKit
let image = NSImage(size:NSSize(width:1024,height:1024))
image.lockFocus()
NSColor(calibratedRed:0.04,green:0.08,blue:0.14,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:40,y:40,width:944,height:944),xRadius:210,yRadius:210).fill()
for y in [270,540] {
 NSColor(calibratedRed:0.11,green:0.20,blue:0.29,alpha:1).setFill()
 NSBezierPath(roundedRect:NSRect(x:195,y:y,width:634,height:210),xRadius:38,yRadius:38).fill()
 NSColor(calibratedRed:0.36,green:0.88,blue:0.70,alpha:1).setFill()
 NSBezierPath(ovalIn:NSRect(x:240,y:y+80,width:50,height:50)).fill()
 for i in 0..<5 { NSBezierPath(roundedRect:NSRect(x:370+i*74,y:y+55,width:36,height:100),xRadius:10,yRadius:10).fill() }
}
image.unlockFocus()
let bitmap=NSBitmapImageRep(data:image.tiffRepresentation!)!
try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
