import { FeaturesList } from '@/constants'
import { featureVersion, modules } from '@/modules'

export const sync = async (socket: LX.Socket) => {
  let disconnected = false
  socket.onClose(() => {
    disconnected = true
  })
  const enabledFeatures = await socket.remote.getEnabledFeatures(
    'server',
    featureVersion,
  )

  if (disconnected) throw new Error('disconnected')
  for (const moduleName of FeaturesList) {
    if (enabledFeatures[moduleName]) {
      socket.feature[moduleName] = enabledFeatures[moduleName]
      try {
        await modules[moduleName].sync(socket)
      } catch (err) {
        console.error(`sync module failed: ${moduleName}`, err)
        throw err
      }
    }
    if (disconnected) throw new Error('disconnected')
  }
  await socket.remote.finished()
}
