import { FeaturesList } from '@/constants'
import { modules } from '@/modules'

const handler: LX.Sync.ServerSyncHandlerActions<LX.Socket> = {
  async onFeatureChanged(socket, feature) {
    const beforeFeature = socket.feature

    for (const name of FeaturesList) {
      const newStatus = feature[name]
      if (newStatus == null) continue
      beforeFeature[name] = feature[name]
      socket.moduleReadys[name] = false
      if (feature[name]) {
        try {
          await modules[name].sync(socket)
        } catch (err) {
          console.error(`feature sync failed: ${name}`, err)
          throw err
        }
      }
    }
  },
}

export default handler
