const { realpathSync } = require('node:fs')
const { relative, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { parse } = require('acorn')
const remapping = require('@jridgewell/remapping')

module.exports = function(source, inputMap) {
  const done = this.async()
  const { packageRoot, version } = this.getOptions()
  const root = realpathSync(resolve(packageRoot, 'dist'))
  const resource = realpathSync(this.resourcePath)
  const moduleName = relative(root, resource).replaceAll('\\', '/').replace(/\.js$/, '')
  if (!/^18\./.test(version) || moduleName.startsWith('../') || moduleName === '..') {
    done(null, source, inputMap)
    return
  }
  import(pathToFileURL(resolve(root, 'vite/react18.js')).href).then(({ adaptReact18 }) => {
    const result = adaptReact18(source, this.resourcePath, moduleName, version,
      code => parse(code, { ecmaVersion: 'latest', sourceType: 'module' }))
    const map = result && inputMap
      ? remapping([result.map, inputMap], () => null)
      : result ? result.map : inputMap
    done(null, result ? result.code : source, map)
  }).catch(done)
}
