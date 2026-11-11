export const enum ResourceField {
  Kind,
  Href,
  Options,
  Flags,
  Css,
}

export const enum ResourceFlag {
  High = 1,
  Sent = 2,
  Cancelled = 4,
  Preloaded = 8,
}

export type RenderPath = [parent: RenderPath | null, key: number | string]

export const enum ScopeField {
  Stylesheets,
  Inline,
}
