import { api } from './api'
import type {
  DetectFinalizeRequest,
  DetectFinalizeResponse,
  DetectManualRequest,
  DetectManualResponse,
  DetectSingleFaceRequest,
  DetectSingleFaceResponse,
} from '../types'

export const detectionService = {
  async detectFace({ face, image }: DetectSingleFaceRequest) {
    const form = new FormData()
    form.append('face', face)
    form.append('image', image)
    const response = await api.post<DetectSingleFaceResponse>('/detect/single-face', form)
    return response.data.data
  },
  async finalize(request: DetectFinalizeRequest) {
    const response = await api.post<DetectFinalizeResponse>('/detect/finalize', request)
    return response.data.data
  },
  async createManual(request: DetectManualRequest) {
    const response = await api.post<DetectManualResponse>('/detect/manual', request)
    return response.data.data
  },
}
