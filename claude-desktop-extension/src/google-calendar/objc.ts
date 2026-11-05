// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Just enough of the Objective-C runtime, over `bun:ffi`, to drive AppKit from
 * TypeScript: look up classes and selectors, send messages, make NSStrings,
 * and define a class whose methods are JS callbacks (menu actions, timers,
 * delegates). Only the compiled calendar binary loads this; it is macOS-only.
 *
 * `objc_msgSend` takes whatever the method takes, so it is bound once per
 * argument shape. On arm64 and x86_64 alike, a non-variadic binding with the
 * method's real types is the documented way to call it.
 */

import { CFunction, dlopen, FFIType, JSCallback, ptr, type Pointer } from 'bun:ffi';

const runtime = dlopen('/usr/lib/libobjc.A.dylib', {
  objc_getClass: { args: [FFIType.ptr], returns: FFIType.ptr },
  sel_registerName: { args: [FFIType.ptr], returns: FFIType.ptr },
  objc_allocateClassPair: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.ptr },
  objc_registerClassPair: { args: [FFIType.ptr], returns: FFIType.void },
  class_addMethod: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  objc_msgSend: { args: [], returns: FFIType.void },
}).symbols;

// Loading AppKit registers its classes with the runtime; any one symbol will do.
dlopen('/System/Library/Frameworks/AppKit.framework/AppKit', { NSApplicationLoad: { args: [], returns: FFIType.bool } });

export type Id = Pointer | null;

// bun:ffi sets `.ptr` on every symbol at runtime; its declared types leave it off.
const MSG_SEND = (runtime.objc_msgSend as unknown as { ptr: Pointer }).ptr;
type FfiType = (typeof FFIType)[keyof typeof FFIType];

const cstr = (s: string) => Buffer.from(`${s}\0`);

const selectors = new Map<string, Pointer>();
export function sel(name: string): Pointer {
  let s = selectors.get(name);
  if (!s) {
    const buf = cstr(name);
    s = runtime.sel_registerName(ptr(buf))!;
    selectors.set(name, s);
  }
  return s;
}

export function cls(name: string): Pointer {
  const buf = cstr(name);
  const c = runtime.objc_getClass(ptr(buf));
  if (!c) throw new Error(`Objective-C class ${name} not found`);
  return c;
}

const senders = new Map<string, (...args: unknown[]) => unknown>();
function sender(returns: FfiType, args: FfiType[]): (...args: unknown[]) => unknown {
  const key = `${returns}(${args.join(',')})`;
  let fn = senders.get(key);
  if (!fn) {
    fn = CFunction({ ptr: MSG_SEND, args: [FFIType.ptr, FFIType.ptr, ...args], returns }) as unknown as (...args: unknown[]) => unknown;
    senders.set(key, fn);
  }
  return fn;
}

/** Send a message whose arguments are all objects/selectors and which returns an object (or nothing). */
export function msg(target: Id, selector: string, ...args: Id[]): Id {
  return sender(FFIType.ptr, args.map(() => FFIType.ptr))(target, sel(selector), ...args) as Id;
}

/** Send a message with explicitly typed arguments — numbers, BOOLs, CGFloats. */
export function msgTyped<R = unknown>(target: Id, selector: string, returns: FfiType, args: Array<[FfiType, unknown]>): R {
  return sender(returns, args.map(([t]) => t))(target, sel(selector), ...args.map(([, v]) => v)) as R;
}

/** An autoreleased NSString. */
export function nsstr(s: string): Id {
  const buf = cstr(s);
  return msg(cls('NSString'), 'stringWithUTF8String:', ptr(buf));
}

// Callbacks must outlive every call AppKit makes into them.
const keepAlive: JSCallback[] = [];

/**
 * Define an NSObject subclass whose methods are JS functions taking the
 * message's single object argument (`sender`, the timer, the notification),
 * and return one instance of it.
 */
export function defineHandler(className: string, methods: Record<string, (arg: Id) => void>): Id {
  const nameBuf = cstr(className);
  const klass = runtime.objc_allocateClassPair(cls('NSObject'), ptr(nameBuf), 0);
  if (!klass) throw new Error(`Could not define Objective-C class ${className}`);
  const types = cstr('v@:@');
  for (const [selector, fn] of Object.entries(methods)) {
    const cb = new JSCallback((_self: Id, _cmd: Id, arg: Id) => fn(arg), {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.void,
    });
    keepAlive.push(cb);
    runtime.class_addMethod(klass, sel(selector), cb.ptr, ptr(types));
  }
  runtime.objc_registerClassPair(klass);
  return msg(klass, 'new');
}
