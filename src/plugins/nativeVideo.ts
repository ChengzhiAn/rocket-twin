import { registerPlugin } from '@capacitor/core'

export interface NativeVideoBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeVideoPlugin {
  embed(options: { url: string; bounds: NativeVideoBounds }): Promise<void>
  remove(): Promise<void>
}

export const NativeVideo = registerPlugin<NativeVideoPlugin>('NativeVideo')
