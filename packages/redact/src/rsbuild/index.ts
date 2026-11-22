import { redact } from '../rspack/index'
import type { RedactOptions } from '../rspack/index'

export type { RedactOptions, RedactPreset, RedactFeatures } from '../rspack/index'

interface RsbuildPluginAPI {
  modifyRspackConfig(callback: (config: { plugins?: unknown[] }) => void): void
}

/** Registers Redact's Rspack integration in an Rsbuild browser SPA. */
export function pluginRedact(options: RedactOptions = {}) {
  return {
    name: 'redact',
    setup(api: RsbuildPluginAPI) {
      api.modifyRspackConfig(config => {
        (config.plugins ??= []).push(redact(options))
      })
    },
  }
}

export default pluginRedact
