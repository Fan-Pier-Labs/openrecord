// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// Built by scripts/bundle-setup-widget.ts and inlined by tsup (see tsup.config.ts).
declare module 'virtual:setup-widget' {
  const widget: import('../../scripts/bundle-setup-widget').SetupWidgetBundle;
  export default widget;
}

// esbuild collects imported stylesheets into the bundle's CSS.
declare module '*.css';
