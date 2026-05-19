import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import * as THREE from 'three'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

declare global {
  interface Window {
    serial: any;  // 【修正】名字必须是 serial
    cordova: any;
  }
}


// 声明 cordova 变量，防止 TS 报错
declare let cordova: any;
declare let usbSerial: any; // 【新增】声明串口插件的全局变量

/** 结束同步后根据已记录样本生成的简报（供界面居中展示 / CSV 顶部写入） */
export interface FlightSyncBriefing {
  pilotName: string
  isDemoMode: boolean
  sampleCount: number
  /** 首末样本 mission 时间差，单位 s */
  durationSec: number
  maxHeightAglM: number
  maxVelocityMs: number
  maxAccG: number
  /** 约采样率 = 样本数 / durationSec，duration 为 0 时为 0 */
  avgSampleRateHz: number
  /** 离地高度最大处对应的任务时间 t */
  timeAtMaxAglSec: number
  /** 本段记录末帧对应的任务时间 t1（与「最大高度时刻」对照可看过顶后覆盖的时长） */
  missionEndTimeSec: number
  /** 记录起点到最大 AGL 样本的时间跨度（上升段历时） */
  ascentDurationSec: number
  /** 最大 AGL 样本到记录终点的时间跨度（下降/回收段历时） */
  descentDurationSec: number
  /** 上升段（含顶点）内速度标量峰值 */
  ascentMaxVelocityMs: number
  /** 过顶后至记录终点速度标量峰值 */
  descentMaxVelocityMs: number
  /** 俯仰角绝对值峰值，单位 deg */
  maxAbsPitchDeg: number
  /** 滚转角绝对值峰值，单位 deg */
  maxAbsRollDeg: number
  /** 俯仰角标准差，单位 deg，可作姿态扰动/稳定度参考 */
  pitchStdDeg: number
  /** 三轴角速度合成模峰值，单位 deg/s */
  maxGyroVectorDegS: number
}

type FlightSampleRow = {
  time: string
  altitudeMsl: string
  heightAgl: string
  velocity: string
  accX: string
  accY: string
  accZ: string
  pitch: string
  yaw: string
  roll: string
  gyroX: string
  gyroY: string
  gyroZ: string
  temperature: string
  pressure: string
  padLat: string
  padLon: string
  rocketLat: string
  rocketLon: string
}

type ParsedFlightSample = {
  t: number
  h: number
  v: number
  pitch: number
  roll: number
  gyroMag: number
}

function accMagnitudeG(ax: number, ay: number, az: number): number {
  const mag = Math.sqrt(ax * ax + ay * ay + az * az)
  return mag < 4 ? mag : mag / 9.80665
}

function parseFlightSampleRows(rows: readonly FlightSampleRow[]): ParsedFlightSample[] {
  const out: ParsedFlightSample[] = []
  for (const row of rows) {
    const t = parseFloat(row.time)
    const h = parseFloat(row.heightAgl)
    const v = parseFloat(row.velocity)
    if (!Number.isFinite(t) || !Number.isFinite(h)) continue

    const pitch = parseFloat(row.pitch)
    const roll = parseFloat(row.roll)
    const gx = parseFloat(row.gyroX)
    const gy = parseFloat(row.gyroY)
    const gz = parseFloat(row.gyroZ)

    const gxm = Number.isFinite(gx) ? gx : 0
    const gym = Number.isFinite(gy) ? gy : 0
    const gzm = Number.isFinite(gz) ? gz : 0
    out.push({
      t,
      h,
      v: Number.isFinite(v) ? v : 0,
      pitch: Number.isFinite(pitch) ? pitch : 0,
      roll: Number.isFinite(roll) ? roll : 0,
      gyroMag: Math.sqrt(gxm * gxm + gym * gym + gzm * gzm),
    })
  }
  return out
}

function buildSyncBriefing(
  rows: readonly FlightSampleRow[],
  pilotName: string,
  demo: boolean,
): FlightSyncBriefing {
  const name = pilotName.trim() || '未命名选手'
  const empty = (): FlightSyncBriefing => ({
    pilotName: name,
    isDemoMode: demo,
    sampleCount: 0,
    durationSec: 0,
    maxHeightAglM: 0,
    maxVelocityMs: 0,
    maxAccG: 0,
    avgSampleRateHz: 0,
    timeAtMaxAglSec: 0,
    missionEndTimeSec: 0,
    ascentDurationSec: 0,
    descentDurationSec: 0,
    ascentMaxVelocityMs: 0,
    descentMaxVelocityMs: 0,
    maxAbsPitchDeg: 0,
    maxAbsRollDeg: 0,
    pitchStdDeg: 0,
    maxGyroVectorDegS: 0,
  })

  if (!rows.length) return empty()

  let maxH = -Infinity
  let maxV = -Infinity
  let maxG = -Infinity
  for (const row of rows) {
    const h = parseFloat(row.heightAgl)
    const v = parseFloat(row.velocity)
    const ax = parseFloat(row.accX)
    const ay = parseFloat(row.accY)
    const az = parseFloat(row.accZ)
    const g = accMagnitudeG(
      Number.isFinite(ax) ? ax : 0,
      Number.isFinite(ay) ? ay : 0,
      Number.isFinite(az) ? az : 0,
    )
    if (Number.isFinite(h)) maxH = Math.max(maxH, h)
    if (Number.isFinite(v)) maxV = Math.max(maxV, v)
    if (Number.isFinite(g)) maxG = Math.max(maxG, g)
  }

  const t0 = parseFloat(rows[0]!.time) || 0
  const t1 = parseFloat(rows[rows.length - 1]!.time) || 0
  const durationSec = Math.max(0, t1 - t0)
  const avgSampleRateHz = durationSec > 0 ? rows.length / durationSec : 0
  const parsed = parseFlightSampleRows(rows)

  if (!parsed.length) {
    return {
      ...empty(),
      sampleCount: rows.length,
      durationSec,
      maxHeightAglM: maxH === -Infinity ? 0 : maxH,
      maxVelocityMs: maxV === -Infinity ? 0 : maxV,
      maxAccG: maxG === -Infinity ? 0 : maxG,
      avgSampleRateHz,
      missionEndTimeSec: Number.isFinite(t1) ? t1 : 0,
    }
  }

  let idxMaxH = 0
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i]!.h > parsed[idxMaxH]!.h) idxMaxH = i
  }

  const timeAtMaxAglSec = parsed[idxMaxH]!.t
  const missionEndTimeSec = parsed[parsed.length - 1]!.t
  const ascentDurationSec = Math.max(0, timeAtMaxAglSec - parsed[0]!.t)
  const descentDurationSec = Math.max(0, missionEndTimeSec - timeAtMaxAglSec)

  let ascentMaxVelocityMs = -Infinity
  let descentMaxVelocityMs = -Infinity
  for (let i = 0; i < parsed.length; i++) {
    const v = parsed[i]!.v
    if (i <= idxMaxH) ascentMaxVelocityMs = Math.max(ascentMaxVelocityMs, v)
    if (i >= idxMaxH) descentMaxVelocityMs = Math.max(descentMaxVelocityMs, v)
  }
  if (ascentMaxVelocityMs === -Infinity) ascentMaxVelocityMs = 0
  if (descentMaxVelocityMs === -Infinity) descentMaxVelocityMs = 0

  let maxAbsPitchDeg = 0
  let maxAbsRollDeg = 0
  let maxGyroVectorDegS = 0
  let pitchSum = 0
  for (const p of parsed) {
    maxAbsPitchDeg = Math.max(maxAbsPitchDeg, Math.abs(p.pitch))
    maxAbsRollDeg = Math.max(maxAbsRollDeg, Math.abs(p.roll))
    maxGyroVectorDegS = Math.max(maxGyroVectorDegS, p.gyroMag)
    pitchSum += p.pitch
  }

  const pitchMean = pitchSum / parsed.length
  let pitchVar = 0
  for (const p of parsed) {
    const d = p.pitch - pitchMean
    pitchVar += d * d
  }
  const pitchStdDeg = parsed.length > 1 ? Math.sqrt(pitchVar / parsed.length) : 0

  return {
    pilotName: name,
    isDemoMode: demo,
    sampleCount: rows.length,
    durationSec,
    maxHeightAglM: maxH === -Infinity ? 0 : maxH,
    maxVelocityMs: maxV === -Infinity ? 0 : maxV,
    maxAccG: maxG === -Infinity ? 0 : maxG,
    avgSampleRateHz,
    timeAtMaxAglSec,
    missionEndTimeSec,
    ascentDurationSec,
    descentDurationSec,
    ascentMaxVelocityMs,
    descentMaxVelocityMs,
    maxAbsPitchDeg,
    maxAbsRollDeg,
    pitchStdDeg,
    maxGyroVectorDegS,
  }
}

/** CSV 单元格转义（含逗号、引号、换行时加双引号） */
function csvEscapeCell(value: string | number): string {
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** 将简报对象转为若干行「标签,值」，置于导出文件顶部 */
function briefingToCsvLines(b: FlightSyncBriefing): string[] {
  const L = (label: string, value: string | number) =>
    `${csvEscapeCell(label)},${csvEscapeCell(value)}`
  return [
    L('数据简报', '以下为与本次导出样本一致的统计摘要'),
    L('选手', b.pilotName),
    L('数据源', b.isDemoMode ? '模拟数据' : '实时遥测'),
    L('采样点数', b.sampleCount),
    L('记录时长_s', b.durationSec.toFixed(3)),
    L('约采样率_Hz', b.avgSampleRateHz.toFixed(2)),
    L('最大离地高度AGL_m', b.maxHeightAglM.toFixed(3)),
    L('最大速度全程_m_s', b.maxVelocityMs.toFixed(2)),
    L('最大合加速度等效_G', b.maxAccG.toFixed(2)),
    L('最大高度对应时刻_t_s', b.timeAtMaxAglSec.toFixed(3)),
    L('末帧任务时间_t1_s', b.missionEndTimeSec.toFixed(3)),
    L('上升段历时_s', b.ascentDurationSec.toFixed(3)),
    L('过顶后历时_s', b.descentDurationSec.toFixed(3)),
    L('上升段速度峰值_m_s', b.ascentMaxVelocityMs.toFixed(2)),
    L('下降段速度峰值_m_s', b.descentMaxVelocityMs.toFixed(2)),
    L('俯仰角峰值_abs_deg', b.maxAbsPitchDeg.toFixed(2)),
    L('滚转角峰值_abs_deg', b.maxAbsRollDeg.toFixed(2)),
    L('俯仰标准差_deg', b.pitchStdDeg.toFixed(3)),
    L('合成角速度峰值_deg_s', b.maxGyroVectorDegS.toFixed(1)),
    ',',
    L('原始飞行数据', '以下为逐采样遥测行'),
  ]
}

/** JSON 遥测中可选数字字段解析（兼容 number 与数字字符串） */
function pickFiniteTelemetryNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = source[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

/**
 * 与 `.doc/ESP32传感器数据` 中 calculateQuaternion 的 roll/pitch/yaw(°) → 四元数公式一致。
 * Pad 端优先用该公式重建姿态，规避 ESP 端历史上只对 qw/qx 取反造成的错误四元数。
 */
function witStyleRpyDegToQuaternion(rollDeg: number, pitchDeg: number, yawDeg: number): THREE.Quaternion {
  const r = (rollDeg * Math.PI) / 180
  const p = (pitchDeg * Math.PI) / 180
  const y = (yawDeg * Math.PI) / 180
  const cy = Math.cos(y * 0.5)
  const sy = Math.sin(y * 0.5)
  const cp = Math.cos(p * 0.5)
  const sp = Math.sin(p * 0.5)
  const cr = Math.cos(r * 0.5)
  const sr = Math.sin(r * 0.5)
  const w = cy * cp * cr + sy * sp * sr
  const x = cy * cp * sr - sy * sp * cr
  const yq = sy * cp * sr + cy * sp * cr
  const z = sy * cp * cr - cy * sp * sr
  return new THREE.Quaternion(x, yq, z, w)
}

/** 模拟用：参考典型小型固体「公里级」探空/科创火箭剖面，量纲与阶段与实飞一致 */
const DEMO_G = 9.80665
const DEMO_IGNITION_END_S = 0.28
/** 模拟助推结束时刻 (s)；与 `RocketScene` 尾焰等展示逻辑共用，避免助推外误显尾焰 */
export const DEMO_BURNOUT_S = 4.72
const DEMO_NET_ACCEL_BOOST = 27
const DEMO_DRAG_K = 0.0022
const DEMO_MAIN_DEPLOY_ALT_M = 450
const DEMO_DROGUE_VS_MPS = -8.5
const DEMO_MAIN_VS_MPS = -5.2
const JINAN_MEAN_ELEVATION_M = 51
/** 示意发射架经纬度（青海冷湖一带；海拔基准仍可用济南 51 m，二者独立） WGS84 ° */
const DEMO_PAD_LAT_DEG = 38.22
const DEMO_PAD_LON_DEG = 93.34
/** 模拟水平漂移上限，避免相对位置点跑出雷达半径 */
const DEMO_DRIFT_CAP_M = 2200

type DemoSimState = {
  v: number
  h: number
  drogue: boolean
  main: boolean
  landed: boolean
  driftE: number
  driftN: number
}

function createDemoSimState(): DemoSimState {
  return { v: 0, h: 0, drogue: false, main: false, landed: false, driftE: 0, driftN: 0 }
}

/** 由东北向漂移 (m) 得到火箭经纬度（相对 pad） */
function rocketLatLonFromDriftMeters(
  padLatDeg: number,
  padLonDeg: number,
  driftE: number,
  driftN: number,
): { lat: number; lon: number } {
  const R = 6_371_000
  const φ = (padLatDeg * Math.PI) / 180
  const dLat = (driftN / R) * (180 / Math.PI)
  const dLon = (driftE / (R * Math.cos(φ))) * (180 / Math.PI)
  return { lat: padLatDeg + dLat, lon: padLonDeg + dLon }
}

/** 公里级固体火箭典型伞降风漂：助推小横漂 → 滑行增大 → 减速伞/主伞显著增大 */
function demoWindVelocityMps(
  t: number,
  v: number,
  s: DemoSimState,
): { ve: number; vn: number } {
  if (s.landed) return { ve: 0, vn: 0 }
  let W = 5
  if (t < DEMO_BURNOUT_S) {
    W = 3.2 + 1.4 * Math.sin(t * 4.1)
  } else if (!s.drogue && v > 0) {
    W = 6.5 + 2.2 * Math.sin((t - DEMO_BURNOUT_S) * 0.85)
  } else if (s.drogue && !s.main) {
    W = 11 + 3.5 * Math.sin(t * 0.62)
  } else {
    W = 13.5 + 4 * Math.sin(t * 0.48)
  }
  const θ = t * 0.71 + 0.42
  return { ve: W * Math.sin(θ), vn: W * Math.cos(θ * 0.96) }
}

function demoPressureIsaPa(altM: number): number {
  const h = Math.max(0, altM)
  const factor = Math.max(0, 1 - 2.25577e-5 * h)
  return 101325 * factor ** 5.25588
}

function demoTempIsaC(altM: number): number {
  return 15 - 0.0065 * Math.max(0, altM)
}

function demoVerticalAccelMs2(t: number, h: number, v: number, s: DemoSimState): number {
  if (s.landed) return 0

  if (t < DEMO_IGNITION_END_S) {
    const u = t / DEMO_IGNITION_END_S
    return 3 + (DEMO_NET_ACCEL_BOOST - 3) * u * u
  }
  if (t < DEMO_BURNOUT_S) return DEMO_NET_ACCEL_BOOST

  if (!s.drogue && v > 0) return -DEMO_G - DEMO_DRAG_K * v * Math.abs(v)
  if (!s.drogue && v <= 0 && t >= DEMO_BURNOUT_S) s.drogue = true
  if (s.drogue && !s.main && h < DEMO_MAIN_DEPLOY_ALT_M) s.main = true

  const vTarget = s.main ? DEMO_MAIN_VS_MPS : DEMO_DROGUE_VS_MPS
  const k = s.main ? 2.25 : 1.65
  return k * (vTarget - v)
}

function formatSerialErr(e: unknown): string {
  if (e == null) return '未知错误'
  if (e instanceof Error) return e.message.trim() || '未知错误'
  if (typeof e === 'string') return e
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim()
    try {
      const s = JSON.stringify(e)
      if (s && s !== '{}') return s
    } catch {
      /* ignore */
    }
  }
  return String(e)
}

/** Cordova / WebUSB 读到的一帧 payload 字节长度；空帧不应刷新「链路存活」以避免假在线 */
function serialIncomingByteLength(raw: unknown): number {
  if (raw == null) return 0
  if (raw instanceof ArrayBuffer) return raw.byteLength
  if (ArrayBuffer.isView(raw)) return raw.byteLength
  try {
    return (raw as ArrayLike<number>).length ?? 0
  } catch {
    return 0
  }
}

export const useRocketStore = defineStore('rocket', () => {
  // --- 1. 基础状态 ---
  const isLaunched = ref(false)
  /** 数据同步开始后为 true；点击「结束同步」后为 false，此后不再写入导出表 */
  const isFlightRecording = ref(false)
  /** 结束同步后展示的数据简报；关闭弹层时置 null */
  const syncBriefing = ref<FlightSyncBriefing | null>(null)
  const isDemoMode = ref(true)
  const flightTime = ref(0)
  const isWsConnected = ref(false)
  const showSerialSuccessToast = ref(false);
  const showSerialErrorToast = ref(false)
  const serialErrorMessage = ref('')
  let serialErrorToastTimer: number | undefined

  /** 启动时请求本机定位作为 PAD；失败时提示用户在系统设置中开启权限 */
  const showPadLocationToast = ref(false)
  const padLocationToastMessage = ref('')
  let padLocationToastTimer: number | undefined

  const showPadLocationHint = (message: string) => {
    const text = (message || '无法获取本机位置').trim()
    showPadLocationToast.value = true
    padLocationToastMessage.value = text
    window.clearTimeout(padLocationToastTimer)
    padLocationToastTimer = window.setTimeout(() => {
      showPadLocationToast.value = false
      padLocationToastMessage.value = ''
    }, 12000)
  }

  const dismissPadLocationToast = () => {
    window.clearTimeout(padLocationToastTimer)
    padLocationToastTimer = undefined
    showPadLocationToast.value = false
    padLocationToastMessage.value = ''
  }

  /** 已从本机写入发射架经纬度（启动流程成功时） */
  const padLocationFromDeviceOk = ref(false)

  function describeNavigatorGeoError(code: number): string {
    if (code === 1)
      return '定位权限被拒绝。请在浏览器或系统设置中允许本应用访问位置信息，并刷新页面后重试。'
    if (code === 2) return '暂时无法确定位置（信号或服务不可用），请到开阔处重试。'
    if (code === 3) return '定位超时，请到开阔处重试或检查定位权限。'
    return '无法获取位置，请检查定位权限与网络后重试。'
  }

  /** 防止 resume 与启动并发重复请求 */
  let padLocationFetchInFlight = false

  /** 原生：先高精度(GPS)再降级网络/粗略定位；室内 GPS 常超时但基站/Wi-Fi 仍可给粗略坐标 */
  const fetchNativeLatLon = async (): Promise<{ lat: number; lon: number }> => {
    const tryOnce = async (highAccuracy: boolean) => {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 22000 : 45000,
        maximumAge: 0,
        enableLocationFallback: true,
      })
      return pos.coords
    }

    try {
      const c = await tryOnce(true)
      return { lat: c.latitude, lon: c.longitude }
    } catch (first) {
      console.warn('[PadLocation] high-accuracy failed, trying coarse/network:', first)
      const c = await tryOnce(false)
      return { lat: c.latitude, lon: c.longitude }
    }
  }

  const fetchWebLatLon = async (): Promise<{ lat: number; lon: number }> => {
    const tryOpts = (high: boolean) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation!.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: high,
          timeout: high ? 22000 : 45000,
          maximumAge: 0,
        })
      })
    try {
      const pos = await tryOpts(true)
      return { lat: pos.coords.latitude, lon: pos.coords.longitude }
    } catch (first) {
      console.warn('[PadLocation] web high-accuracy failed, retrying coarse:', first)
      const pos = await tryOpts(false)
      return { lat: pos.coords.latitude, lon: pos.coords.longitude }
    }
  }

  /**
   * 请求 PAD = 本机经纬度（任意模式）。
   * 成功后可跳过重复调用；从后台回到前台时会再次尝试，便于「先去设置开权限再返回」的场景。
   */
  const initPadLocationFromDevice = async () => {
    if (padLocationFromDeviceOk.value) return
    if (padLocationFetchInFlight) return
    padLocationFetchInFlight = true

    try {
      let lat: number
      let lon: number

      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await Geolocation.requestPermissions()
          const granted =
            perm.location === 'granted' || perm.coarseLocation === 'granted'
          if (!granted) {
            showPadLocationHint(
              '无法获取发射架（平板）位置：定位权限未授予。请到系统设置 → 应用 → 本应用 → 权限 → 开启「位置信息」（建议精确位置）。授权后请返回本应用，无需强制杀进程。',
            )
            return
          }
        } catch {
          showPadLocationHint(
            '无法请求定位权限：请确认系统「定位服务」已开启，并在设置中为该应用授予位置权限。',
          )
          return
        }

        const coords = await fetchNativeLatLon()
        lat = coords.lat
        lon = coords.lon
      } else {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          showPadLocationHint('当前环境不支持浏览器定位（开发时请使用 HTTPS 或安装 Android 应用）。')
          return
        }
        const coords = await fetchWebLatLon()
        lat = coords.lat
        lon = coords.lon
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        showPadLocationHint('定位返回无效坐标，请重试或检查权限。')
        return
      }

      padLatitude.value = lat
      padLongitude.value = lon
      padLocationFromDeviceOk.value = true
    } catch (e: unknown) {
      const nav = e as GeolocationPositionError
      if (typeof nav?.code === 'number') {
        showPadLocationHint(describeNavigatorGeoError(nav.code))
        return
      }
      const msg = formatSerialErr(e)
      showPadLocationHint(
        msg && msg !== '未知错误'
          ? `无法获取本机位置：${msg}。请确认系统「定位」开关已打开；若在设置里刚授权，请切回本应用或下拉触发后台刷新。室内可尝试靠近窗台或稍后重试。`
          : '无法获取本机位置。请确认系统定位服务已开启并已授权本应用；室内 GPS 可能较慢，已自动尝试网络定位。',
      )
    } finally {
      padLocationFetchInFlight = false
    }
  }

  const showSerialError = (message: string) => {
    const text = (message || '连接失败，请稍后重试').trim()
    showSerialSuccessToast.value = false
    serialErrorMessage.value = text
    showSerialErrorToast.value = true
    window.clearTimeout(serialErrorToastTimer)
    serialErrorToastTimer = window.setTimeout(() => {
      showSerialErrorToast.value = false
      serialErrorMessage.value = ''
    }, 7000)
  }

  // --- 视频链路状态：仅保留经典 ESP32-CAM MJPEG ---
  type VideoSource = 'ESP32_CAM'
  const videoSource = ref<VideoSource>('ESP32_CAM')
  const esp32CamHost = ref(localStorage.getItem('rocket_esp32_cam_host') || '192.168.4.1')

  const setVideoSource = (_source: VideoSource = 'ESP32_CAM') => {
    videoSource.value = 'ESP32_CAM'
    localStorage.setItem('rocket_video_source', 'ESP32_CAM')
  }

  const setEsp32CamHost = (host: string) => {
    const cleaned = (host || '').trim().replace(/\/$/, '')
    if (!cleaned) return
    esp32CamHost.value = cleaned
    localStorage.setItem('rocket_esp32_cam_host', cleaned)
  }

  let serialPort: any = null;
  let serialReader: any = null;

  /** Windows Web Serial：断开后部分驱动 read() 不结束，靠空闲判定掉线 */
  let telemetryViaWindowsSerial = false
  let windowsSerialWatchTimer: ReturnType<typeof setInterval> | undefined
  let lastWindowsSerialRx = 0
  let windowsSerialSawValidLine = false
  let windowsSerialLostHandling = false

  /** 安卓 USB 串口：拔掉后插件未必回调错误，用接收超时兜底 */
  let androidSerialWatchTimer: ReturnType<typeof setInterval> | undefined
  let lastAndroidSerialRx = 0
  let androidSerialSawValidLine = false
  let androidSerialLostHandling = false

  const isAndroidSerialHost = () =>
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

  const clearAndroidSerialWatchdog = () => {
    if (androidSerialWatchTimer !== undefined) {
      window.clearInterval(androidSerialWatchTimer)
      androidSerialWatchTimer = undefined
    }
  }

  const bumpAndroidSerialRx = () => {
    lastAndroidSerialRx = Date.now()
  }

  const clearWindowsSerialWatchdog = () => {
    if (windowsSerialWatchTimer !== undefined) {
      window.clearInterval(windowsSerialWatchTimer)
      windowsSerialWatchTimer = undefined
    }
  }

  const bumpWindowsSerialRx = () => {
    lastWindowsSerialRx = Date.now()
  }

  const handleWindowsSerialLost = async (reason: string) => {
    if (!telemetryViaWindowsSerial || !isWsConnected.value || windowsSerialLostHandling) return
    windowsSerialLostHandling = true
    try {
      clearWindowsSerialWatchdog()
      isWsConnected.value = false
      telemetryViaWindowsSerial = false
      windowsSerialSawValidLine = false
      showSerialError(reason)
      await stopSerial()
    } finally {
      window.setTimeout(() => {
        windowsSerialLostHandling = false
      }, 500)
    }
  }

  const startWindowsSerialWatchdog = () => {
    clearWindowsSerialWatchdog()
    lastWindowsSerialRx = Date.now()
    windowsSerialSawValidLine = false
    windowsSerialWatchTimer = window.setInterval(() => {
      if (!telemetryViaWindowsSerial || !isWsConnected.value || isDemoMode.value) {
        clearWindowsSerialWatchdog()
        return
      }
      const idle = Date.now() - lastWindowsSerialRx
      const thresholdMs = windowsSerialSawValidLine ? 10000 : 35000
      if (idle > thresholdMs) {
        const msg = windowsSerialSawValidLine
          ? '已长时间未收到 LoRa 数据，串口可能已断开，请重新连接。'
          : '连接后未收到有效遥测数据，请检查 LoRa、线材与波特率后重试。'
        void handleWindowsSerialLost(msg)
      }
    }, 2000)
  }

  const stopAndroidSerial = async () => {
    clearAndroidSerialWatchdog()
    try {
      if (typeof window !== 'undefined' && window.serial) {
        await new Promise<void>((resolve) => {
          window.serial.close(
            () => {
              console.log('✅ 串口已关闭')
              resolve()
            },
            () => {
              console.warn('⚠️ 串口关闭失败或本未打开')
              resolve()
            },
          )
        })
      }
    } catch (error) {
      console.error('关闭串口失败', error)
    } finally {
      isWsConnected.value = false
      rocketGpsValid.value = false
    }
  }

  const handleAndroidSerialLost = async (reason: string) => {
    if (!isAndroidSerialHost()) return
    if (!isWsConnected.value || androidSerialLostHandling) return
    androidSerialLostHandling = true
    try {
      clearAndroidSerialWatchdog()
      isWsConnected.value = false
      androidSerialSawValidLine = false
      showSerialError(reason)
      await stopAndroidSerial()
    } finally {
      window.setTimeout(() => {
        androidSerialLostHandling = false
      }, 500)
    }
  }

  const startAndroidSerialWatchdog = () => {
    clearAndroidSerialWatchdog()
    lastAndroidSerialRx = Date.now()
    androidSerialSawValidLine = false
    androidSerialWatchTimer = window.setInterval(() => {
      if (!isWsConnected.value || isDemoMode.value) {
        clearAndroidSerialWatchdog()
        return
      }
      if (!isAndroidSerialHost()) {
        clearAndroidSerialWatchdog()
        return
      }
      const idle = Date.now() - lastAndroidSerialRx
      const thresholdMs = androidSerialSawValidLine ? 10000 : 35000
      if (idle > thresholdMs) {
        const msg = androidSerialSawValidLine
          ? '已长时间未收到 LoRa 数据，USB 可能已断开，请重新插入模块后再次点击连接。'
          : '连接后未收到有效遥测数据，请检查 LoRa、线材与波特率后重试。'
        void handleAndroidSerialLost(msg)
      }
    }, 2000)
  }

  // --- 2. 物理数据状态 ---
  const acc = reactive({ x: 0, y: 0, z: 0 })
  const gyro = reactive({ x: 0, y: 0, z: 0 })
  const mag = reactive({ x: 0, y: 0, z: 0 })
  const quat_raw = reactive({ w: 1, x: 0, y: 0, z: 0 })
  
  /** 传感器海拔 AMSL，单位 m。实时 JSON/CSV 字段必须为米，非千米。 */
  const altitudeMsl = ref(JINAN_MEAN_ELEVATION_M)
  /** 点击「数据同步」记录的地面海拔 AMSL，单位 m。 */
  const groundElevationMsl = ref<number | null>(null)
  /** 离地高度 AGL = 当前海拔 - 地面基准，单位 m。 */
  const heightAboveGround = ref(0)
  /** 兼容旧组件命名：altitude 现在表示离地高度 AGL，单位 m。 */
  const altitude = computed(() => heightAboveGround.value)
  const hasGroundBaseline = computed(() => groundElevationMsl.value !== null)

  function effectiveGroundMsl(): number | null {
    if (groundElevationMsl.value !== null) return groundElevationMsl.value
    if (isDemoMode.value) return JINAN_MEAN_ELEVATION_M
    return null
  }

  function recomputeHeightAboveGround() {
    const ground = effectiveGroundMsl()
    heightAboveGround.value = ground === null ? 0 : altitudeMsl.value - ground
  }

  function setAltitudeMslFromSensor(msl: number) {
    altitudeMsl.value = Number.isFinite(msl) ? msl : 0
    recomputeHeightAboveGround()
  }

  const syncGroundBaseline = () => {
    groundElevationMsl.value = altitudeMsl.value
    recomputeHeightAboveGround()
    console.log(`✅ 地面基准海拔已同步: ${groundElevationMsl.value.toFixed(2)} m MSL，离地高度已归零`)
  }

  recomputeHeightAboveGround()
  const temperature = ref(20)
  const pressure = ref(101325)
  const pitch = ref(0)
  const yaw = ref(0)
  const roll = ref(0)

  /** 发射架 / 火箭 WGS84（°）；实时模式下 rocketGpsValid 为 false 时不应在 UI 绘制火箭相对点 */
  const padLatitude = ref(DEMO_PAD_LAT_DEG)
  const padLongitude = ref(DEMO_PAD_LON_DEG)
  const rocketLatitude = ref(DEMO_PAD_LAT_DEG)
  const rocketLongitude = ref(DEMO_PAD_LON_DEG)
  const rocketGpsValid = ref(false)

  const gForce = ref(1.0)
  const verticalSpeed = ref(0)
  const velocity = ref(0)
  const quaternion = reactive(new THREE.Quaternion())

  /**
   * 传感器坐标系 → 火箭模型坐标系 的固定旋转。
   *
   * 当前确认：火箭模型弹头方向为局部 +Y；Wit 模块按 +X 指向真实弹头安装。
   * 这里把模型 +Y 映射到传感器 +X，否则俯仰/偏航会耦合甚至镜像反向。
   */
  const modelToSensorFrame = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -Math.PI / 2,
  )

  /** 地面“看起来稳定”：静止时锁定姿态，避免磁航向慢漂带动模型自旋。 */
  let lastMotionTs = Date.now()
  const frozenQuat = new THREE.Quaternion()
  let hasFrozenQuat = false

  function maybeApplyStableQuaternion(qCandidate: THREE.Quaternion) {
    // 飞行中绝不锁定；只在地面展示时做抗漂移观感优化。
    if (isLaunched.value) {
      quaternion.copy(qCandidate)
      hasFrozenQuat = false
      return
    }

    const gyroMag = Math.sqrt(gyro.x * gyro.x + gyro.y * gyro.y + gyro.z * gyro.z) // deg/s
    const gMag = accMagnitudeG(acc.x, acc.y, acc.z)
    const isStill = gyroMag < 1.2 && Math.abs(gMag - 1) < 0.10

    if (!isStill) {
      lastMotionTs = Date.now()
      quaternion.copy(qCandidate)
      frozenQuat.copy(qCandidate)
      hasFrozenQuat = true
      return
    }

    // 静止持续一小段时间后开始锁定，避免用户刚停手的瞬态被卡住。
    const idleMs = Date.now() - lastMotionTs
    if (idleMs < 800 || !hasFrozenQuat) {
      quaternion.copy(qCandidate)
      frozenQuat.copy(qCandidate)
      hasFrozenQuat = true
      return
    }

    quaternion.copy(frozenQuat)
  }

  let lastHeight = 0
  let lastUpdateTime = Date.now()

  // --- 3. 归零校准状态 (新增) ---
  const zeroQuat = reactive(new THREE.Quaternion())
  const hasCalibrated = ref(false)

  // --- 4. 历史数据状态 ---
  const historyData = reactive({
    time: [] as string[],
    /** 离地高度 AGL，单位 m。 */
    altitude: [] as number[],
    velocity: [] as number[],
    temperature: [] as number[],
    pressure: [] as number[]
  })

  // --- 4.1 全量数据记录 (新增) ---
  const currentStudentName = ref('')
  const fullFlightData = reactive<any[]>([])

  // --- 5. 计算属性 ---
  const formattedTime = computed(() => {
    const s = Math.floor(flightTime.value)
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  })

  // --- 6. 核心公共函数 ---
  const pushToHistory = () => {
    if (!isLaunched.value) return 
    
    const timeTag = new Date().toLocaleTimeString().split(' ')[0] || ''
    historyData.time.push(timeTag)
    historyData.altitude.push(Number(heightAboveGround.value.toFixed(3)))
    historyData.velocity.push(Number(velocity.value.toFixed(2)))
    historyData.temperature.push(Number(temperature.value.toFixed(1)))
    historyData.pressure.push(Number(pressure.value.toFixed(0)))

    if (historyData.time.length > 50) {
      historyData.time.shift(); historyData.altitude.shift();
      historyData.velocity.shift(); historyData.temperature.shift();
      historyData.pressure.shift();
    }
  }

  const processDerivedMetrics = () => {
    const now = Date.now();
    const dt = (now - lastUpdateTime) / 1000;
    if (dt > 0) {
      gForce.value = accMagnitudeG(acc.x, acc.y, acc.z)
      verticalSpeed.value = (heightAboveGround.value - lastHeight) / dt;
      velocity.value = Math.abs(verticalSpeed.value);
      
      if (isLaunched.value) {
        flightTime.value += dt
        pushToHistory()
      }

      // 仅同步记录窗口内写入导出表（结束同步后画面与图表仍继续更新）
      if (isLaunched.value && isFlightRecording.value) {
        fullFlightData.push({
          time: flightTime.value.toFixed(3),
          altitudeMsl: altitudeMsl.value.toFixed(2),
          heightAgl: heightAboveGround.value.toFixed(3),
          velocity: velocity.value.toFixed(2),
          accX: acc.x.toFixed(2), accY: acc.y.toFixed(2), accZ: acc.z.toFixed(2),
          gyroX: gyro.x.toFixed(2), gyroY: gyro.y.toFixed(2), gyroZ: gyro.z.toFixed(2),
          pitch: pitch.value.toFixed(2), yaw: yaw.value.toFixed(2), roll: roll.value.toFixed(2),
          temperature: temperature.value.toFixed(1),
          pressure: pressure.value.toFixed(0),
          padLat: padLatitude.value.toFixed(6),
          padLon: padLongitude.value.toFixed(6),
          rocketLat: rocketLatitude.value.toFixed(6),
          rocketLon: rocketLongitude.value.toFixed(6),
        })
      }
      
      lastHeight = heightAboveGround.value;
      lastUpdateTime = now;
    }
  };

  /**
   * LoRa 紧凑 JSON：
   * ax,ay,az,gx,gy,gz,mx,my,mz,qw,qx,qy,qz,roll,yaw,pitch(°),h(MSL m),t(℃),p(Pa)
   * 与历史 19 列 CSV 语义一致；未识别时返回 false。
   */
  const applyCompactLoRaTelemetry = (o: Record<string, unknown>): boolean => {
    const ax = pickFiniteTelemetryNumber(o, ['ax'])
    const ay = pickFiniteTelemetryNumber(o, ['ay'])
    const az = pickFiniteTelemetryNumber(o, ['az'])
    if (ax === null || ay === null || az === null) return false

    const rollDeg = pickFiniteTelemetryNumber(o, ['roll'])
    const pitchDeg = pickFiniteTelemetryNumber(o, ['pitch'])
    const yawDeg = pickFiniteTelemetryNumber(o, ['yaw'])
    const hasEuler = rollDeg !== null && pitchDeg !== null && yawDeg !== null

    const qwIn = pickFiniteTelemetryNumber(o, ['qw'])
    const qxIn = pickFiniteTelemetryNumber(o, ['qx'])
    const qyIn = pickFiniteTelemetryNumber(o, ['qy'])
    const qzIn = pickFiniteTelemetryNumber(o, ['qz'])
    const hasQuat = qwIn !== null && qxIn !== null && qyIn !== null && qzIn !== null
    if (!hasEuler && !hasQuat) return false

    acc.x = ax
    acc.y = ay
    acc.z = az

    gyro.x = pickFiniteTelemetryNumber(o, ['gx']) ?? 0
    gyro.y = pickFiniteTelemetryNumber(o, ['gy']) ?? 0
    gyro.z = pickFiniteTelemetryNumber(o, ['gz']) ?? 0

    mag.x = pickFiniteTelemetryNumber(o, ['mx']) ?? 0
    mag.y = pickFiniteTelemetryNumber(o, ['my']) ?? 0
    mag.z = pickFiniteTelemetryNumber(o, ['mz']) ?? 0

    if (rollDeg !== null) roll.value = rollDeg
    if (pitchDeg !== null) pitch.value = pitchDeg
    if (yawDeg !== null) yaw.value = yawDeg

    const rawQuat = hasEuler
      ? witStyleRpyDegToQuaternion(rollDeg!, pitchDeg!, yawDeg!)
      : new THREE.Quaternion(qxIn!, qyIn!, qzIn!, qwIn!)

    quat_raw.w = rawQuat.w
    quat_raw.x = rawQuat.x
    quat_raw.y = rawQuat.y
    quat_raw.z = rawQuat.z

    const h = pickFiniteTelemetryNumber(o, ['h', 'altitude_msl', 'altitude', 'height'])
    if (h !== null) setAltitudeMslFromSensor(h)

    const temp = pickFiniteTelemetryNumber(o, ['t', 'temperature'])
    if (temp !== null) temperature.value = temp

    const press = pickFiniteTelemetryNumber(o, ['p', 'pressure'])
    if (press !== null) pressure.value = press

    const rawQuatModel = rawQuat.clone().multiply(modelToSensorFrame)
    if (rawQuatModel.w < 0) {
      rawQuatModel.w *= -1
      rawQuatModel.x *= -1
      rawQuatModel.y *= -1
      rawQuatModel.z *= -1
    }
    const qCandidate = zeroQuat.clone().multiply(rawQuatModel)
    maybeApplyStableQuaternion(qCandidate)

    if (!isDemoMode.value) {
      const plat = pickFiniteTelemetryNumber(o, ['pad_lat', 'padLat', 'pad_latitude'])
      const plon = pickFiniteTelemetryNumber(o, ['pad_lon', 'padLon', 'pad_longitude'])
      const rlat = pickFiniteTelemetryNumber(o, ['rocket_lat', 'rocketLat', 'rocket_latitude', 'gps_lat'])
      const rlon = pickFiniteTelemetryNumber(o, ['rocket_lon', 'rocketLon', 'rocket_longitude', 'gps_lon'])
      if (plat !== null && plon !== null) {
        padLatitude.value = plat
        padLongitude.value = plon
      }
      if (rlat !== null && rlon !== null) {
        rocketLatitude.value = rlat
        rocketLongitude.value = rlon
        rocketGpsValid.value = true
      } else {
        rocketGpsValid.value = false
      }
    }

    processDerivedMetrics()
    return true
  }

  // --- 7. 归零校准核心函数 (新增) ---
  const calibrateZero = () => {
    // 记录当前姿态的逆四元数，作为归零偏移
    zeroQuat.copy(quaternion).invert()
    hasFrozenQuat = false
    lastMotionTs = Date.now()
    hasCalibrated.value = true
    console.log("✅ 姿态校准完成：当前位置已设为初始零位")
  }

  // --- 8. 基础设置函数 ---
  const toggleMode = () => {
    isDemoMode.value = !isDemoMode.value
    rocketGpsValid.value = false
    if (isDemoMode.value) {
      padLatitude.value = DEMO_PAD_LAT_DEG
      padLongitude.value = DEMO_PAD_LON_DEG
      rocketLatitude.value = DEMO_PAD_LAT_DEG
      rocketLongitude.value = DEMO_PAD_LON_DEG
    }
  }

  // --- 9. Windows Web Serial 通信逻辑 ---
  const initWindowsSerial = async () => {
    if (!('serial' in navigator)) {
      showSerialError('当前浏览器不支持串口，请使用 Chrome 或 Edge 并选择本机 USB 串口。')
      return
    }

    clearWindowsSerialWatchdog()
    telemetryViaWindowsSerial = false

    try {
      serialPort = await (navigator as any).serial.requestPort();
      await serialPort.open({ baudRate: 115200 });
      isWsConnected.value = true;
      isDemoMode.value = false;
      rocketGpsValid.value = false
      showSerialErrorToast.value = false
      serialErrorMessage.value = ''

      const decoder = new TextDecoder();
      serialReader = serialPort.readable.getReader();

      let serialBuffer = "";

      console.log("🟢 Windows 串口连接成功，开始解析 LoRa 流...");

      telemetryViaWindowsSerial = true
      bumpWindowsSerialRx()
      startWindowsSerialWatchdog()

      while (true) {
        const { value, done } = await serialReader.read();
        if (done) {
          isWsConnected.value = false
          showSerialError('串口已关闭，LoRa 可能已断开，请重新连接。')
          break
        }

        if (serialIncomingByteLength(value) > 0) {
          bumpWindowsSerialRx()
        }

        serialBuffer += decoder.decode(value, { stream: true });

        if (serialBuffer.includes('\n')) {
          const lines = serialBuffer.split('\n');
          serialBuffer = lines.pop() || "";

          lines.forEach(line => {
            if (line.trim()) {
              parseCsvData(line.trim());
            }
          });
        }
      }
    } catch (error) {
      console.error("串口操作失败:", error);
      isWsConnected.value = false;
      showSerialError(`串口已取消或失败：${formatSerialErr(error)}`)
    } finally {
      telemetryViaWindowsSerial = false
      clearWindowsSerialWatchdog()
    }
  };

  const stopSerial = async () => {
    telemetryViaWindowsSerial = false
    clearWindowsSerialWatchdog()
    if (serialReader) {
      await serialReader.cancel();
      serialReader = null;
    }
    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
    isWsConnected.value = false;
    rocketGpsValid.value = false
  };

  // --- 【最终适配版】等待插件加载完成 ---
  const waitForPluginReady = (): Promise<void> => {
    return new Promise((resolve) => {
      // 插件已经加载完成，直接返回
      if (typeof window !== 'undefined' && window.serial) {
        resolve();
        return;
      }

      // 等待原生设备就绪
      const onDeviceReady = () => {
        document.removeEventListener('deviceready', onDeviceReady, false);
        // 额外200ms缓冲，确保API完全就绪
        setTimeout(() => resolve(), 200);
      };
      document.addEventListener('deviceready', onDeviceReady, false);

      // 超时兜底：最多等3秒
      setTimeout(() => {
        document.removeEventListener('deviceready', onDeviceReady, false);
        resolve();
      }, 3000);
    });
  };

  // --- 【最终适配版】安卓串口连接核心函数 ---
  const initAndroidSerial = async () => {
    console.log("🔵 开始执行安卓串口连接逻辑");
    try {
      await waitForPluginReady()

      if (isAndroidSerialHost() && typeof window !== 'undefined' && window.serial) {
        await stopAndroidSerial()
        await new Promise<void>((r) => setTimeout(r, 220))
      }

      if (!window.serial) {
        const errMsg =
          '串口插件未就绪，请完全关闭应用后重试，或检查 cordovarduino 是否已安装'
        console.error(errMsg)
        showSerialError(errMsg)
        return
      }
      console.log("✅ 串口插件就绪", window.serial);

      console.log("🔵 开始申请USB权限");
      const permissionGranted = await new Promise<boolean>((resolve) => {
        window.serial.requestPermission(
          {},
          () => {
            console.log("✅ USB权限申请成功");
            resolve(true);
          },
          (err: any) => {
            console.error("❌ USB权限申请失败", err)
            const extra = formatSerialErr(err)
            showSerialError(
              extra && extra !== '未知错误'
                ? `未连接 USB 串口或未授权：${extra}。请插入 LoRa 模块、接好 OTG，并在系统弹窗中选择允许。`
                : '未连接 USB 串口或未授权。请插入 LoRa 模块、接好 OTG，并在系统弹窗中选择允许。',
            )
            resolve(false)
          },
        );
      });

      if (!permissionGranted) return;

      console.log("🔵 开始打开串口");
      const openSuccess = await new Promise<boolean>((resolve) => {
        window.serial.open(
          {
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: 0,
            dtr: true,
            rts: true,
            sleepOnPause: false
          },
          () => {
            console.log("✅ 串口打开成功");
            resolve(true);
          },
          (err: any) => {
            console.error("❌ 串口打开失败", err)
            const extra = formatSerialErr(err)
            showSerialError(
              extra && extra !== '未知错误'
                ? `串口无法打开：${extra}。请确认 LoRa 已连接、波特率 115200，或重新插拔 USB。`
                : '串口无法打开：请确认 LoRa 已连接、波特率 115200，或重新插拔 USB。',
            )
            resolve(false)
          },
        );
      });

      if (!openSuccess) return;

      isWsConnected.value = true;
      isDemoMode.value = false;
      rocketGpsValid.value = false
      showSerialErrorToast.value = false
      serialErrorMessage.value = ''
      console.log("🟢 华为平板USB串口连接成功，开始解析LoRa流...");
      showSerialSuccessToast.value = true;
      setTimeout(() => {
        showSerialSuccessToast.value = false;
      }, 3000);

      let androidBuffer = "";

      window.serial.registerReadCallback(
        (data: any) => {
          if (serialIncomingByteLength(data) < 1) {
            return
          }
          bumpAndroidSerialRx()
          try {
            const decodedString = new TextDecoder().decode(new Uint8Array(data));
            console.log("📥 收到串口原始数据:", decodedString);

            androidBuffer += decodedString;
            if (androidBuffer.includes('\n')) {
              const lines = androidBuffer.split('\n');
              androidBuffer = lines.pop() || "";

              lines.forEach(line => {
                if (line.trim()) {
                  console.log("📝 解析数据行:", line.trim());
                  parseCsvData(line.trim());
                }
              });
            }
          } catch (parseErr) {
            console.error("❌ 数据解析失败", parseErr);
          }
        },
        (err: any) => {
          console.error("❌ 串口数据接收失败", err);
          void handleAndroidSerialLost(`LoRa 串口已断开或读取失败：${formatSerialErr(err)}`)
        }
      );

      startAndroidSerialWatchdog()

    } catch (globalErr) {
      console.error("❌ 安卓串口全局异常", globalErr)
      clearAndroidSerialWatchdog()
      isWsConnected.value = false
      showSerialError(`连接异常：${formatSerialErr(globalErr)}`)
    }
  };

  // --- 11. CSV / JSON 数据解析逻辑 (串口用) ---
  // 扩展列（0-based 索引 19-22）：pad_lat, pad_lon, rocket_lat, rocket_lon，单位 ° WGS84；须 length >= 23
  const parseCsvData = (line: string) => {
    try {
      const trimmed = line.trim()
      if (trimmed.startsWith('{')) {
        try {
          const o = JSON.parse(trimmed) as Record<string, unknown>
          if (applyCompactLoRaTelemetry(o)) {
            if (isAndroidSerialHost()) {
              androidSerialSawValidLine = true
              bumpAndroidSerialRx()
            }
            if (telemetryViaWindowsSerial) {
              windowsSerialSawValidLine = true
              bumpWindowsSerialRx()
            }
            return
          }
          console.warn('JSON 行缺少紧凑遥测姿态字段（需 ax..az 且 roll/pitch/yaw 或 qw..qz），跳过:', trimmed.slice(0, 120))
        } catch {
          console.warn('JSON 解析失败，跳过该行:', trimmed.slice(0, 120))
        }
        return
      }

      // 现场存在旧 LoRa 模块广播 CSV；当前版本仅接受 JSON，直接忽略非 JSON 行。
      return

      const parts = line.split(',').map(v => parseFloat(v.trim()));
      const core = parts.slice(0, 19)

      if (core.length < 19 || core.some(isNaN)) {
        console.warn('CSV数据格式错误，跳过该行:', line);
        return;
      }

      acc.x = core[0] ?? 0; acc.y = core[1] ?? 0; acc.z = core[2] ?? 0;
      gyro.x = core[3] ?? 0; gyro.y = core[4] ?? 0; gyro.z = core[5] ?? 0;
      mag.x = core[6] ?? 0; mag.y = core[7] ?? 0; mag.z = core[8] ?? 0;
      
      quat_raw.w = core[9] ?? 1;
      quat_raw.x = core[10] ?? 0;
      quat_raw.y = core[11] ?? 0;
      quat_raw.z = core[12] ?? 0;
      
      roll.value = core[13] ?? 0;
      yaw.value = core[14] ?? 0;
      pitch.value = core[15] ?? 0;

      // CSV 列索引 16：海拔 AMSL，单位 m（非 km）
      setAltitudeMslFromSensor(core[16] ?? 0);
      temperature.value = core[17] ?? 20;
      pressure.value = core[18] ?? 101325;

      if (!isDemoMode.value && parts.length >= 23) {
        const plat = parts[19]
        const plon = parts[20]
        const rlat = parts[21]
        const rlon = parts[22]
        if (Number.isFinite(plat) && Number.isFinite(plon)) {
          padLatitude.value = plat as number
          padLongitude.value = plon as number
        }
        if (Number.isFinite(rlat) && Number.isFinite(rlon)) {
          rocketLatitude.value = rlat as number
          rocketLongitude.value = rlon as number
          rocketGpsValid.value = true
        } else {
          rocketGpsValid.value = false
        }
      } else if (!isDemoMode.value) {
        rocketGpsValid.value = false
      }

      // 【核心修改】应用坐标系映射 + 归零校准（统一四元数符号，防止双覆盖导致方向反转）
      const rawQuatSensor = new THREE.Quaternion(quat_raw.x, quat_raw.y, quat_raw.z, quat_raw.w)
      const rawQuatModel = rawQuatSensor.multiply(modelToSensorFrame)
      if (rawQuatModel.w < 0) {
        rawQuatModel.w *= -1
        rawQuatModel.x *= -1
        rawQuatModel.y *= -1
        rawQuatModel.z *= -1
      }
      const qCandidate = zeroQuat.clone().multiply(rawQuatModel)
      maybeApplyStableQuaternion(qCandidate)

      processDerivedMetrics();

      if (isAndroidSerialHost()) {
        androidSerialSawValidLine = true
        bumpAndroidSerialRx()
      }

      if (telemetryViaWindowsSerial) {
        windowsSerialSawValidLine = true
        bumpWindowsSerialRx()
      }

    } catch (e) {
      console.warn("解析行失败:", line);
    }
  };

  // --- 12. Demo 模拟模式逻辑（固体公里级典型剖面：点火→助推→无动力顶点→减速伞→主伞→着陆） ---
  let demoTimer: number | null = null
  let demoSimState = createDemoSimState()

  const applyDemoSensorsAndAttitude = (
    t: number,
    rocketMslM: number,
    v: number,
    aNet: number,
    s: DemoSimState,
  ) => {
    const deg = Math.PI / 180
    const lateral = Math.sin(t * 2.2) * 0.55 + Math.sin(t * 8.1) * 0.12
    const side = Math.cos(t * 1.9) * 0.5 + Math.sin(t * 5.4) * 0.18

    if (s.landed) {
      acc.x = 0
      acc.y = 0
      acc.z = DEMO_G
      gyro.x = 0
      gyro.y = 0
      gyro.z = 0
      pitch.value = 90
      yaw.value = 0
      roll.value = 0
    } else if (t < DEMO_BURNOUT_S) {
      acc.x = lateral * 0.35
      acc.y = side * 0.35
      acc.z = DEMO_G + aNet
      gyro.x = 6 * Math.sin(t * 3.1) + 4 * Math.sin(t * 11)
      gyro.y = 5 * Math.cos(t * 2.7) + 3 * Math.sin(t * 9)
      gyro.z = 2 * Math.sin(t * 4.2)
      const wobble = 0.35 * Math.sin(t * 4.5)
      pitch.value = 89.2 + wobble + 0.02 * (t * t)
      yaw.value = 0.4 * Math.sin(t * 1.1)
      roll.value = 1.2 * Math.sin(t * 2.4)
    } else if (!s.drogue && v > 0) {
      acc.x = lateral * 0.15
      acc.y = side * 0.15
      acc.z = DEMO_G + aNet
      gyro.x = 18 * Math.sin(t * 2.8) + 12 * Math.sin(t * 6.2)
      gyro.y = 16 * Math.cos(t * 2.1) + 10 * Math.sin(t * 5.5)
      gyro.z = 8 * Math.sin(t * 3.3)
      pitch.value = 88 + 0.6 * Math.sin((t - DEMO_BURNOUT_S) * 2.1)
      yaw.value = 1.2 * Math.sin((t - DEMO_BURNOUT_S) * 0.9)
      roll.value = 2 * Math.sin((t - DEMO_BURNOUT_S) * 1.7)
    } else if (s.drogue && !s.main) {
      acc.x = lateral * 1.1 + 0.8 * Math.sin(t * 5.2)
      acc.y = side * 1.0 + 0.7 * Math.cos(t * 4.6)
      acc.z = DEMO_G + aNet
      gyro.x = 35 * Math.sin(t * 3.4) + 22 * Math.sin(t * 7.1)
      gyro.y = 32 * Math.cos(t * 2.9) + 18 * Math.sin(t * 6.3)
      gyro.z = 14 * Math.sin(t * 4.1)
      pitch.value = 72 + 18 * Math.sin((t - DEMO_BURNOUT_S) * 1.15)
      yaw.value = 8 * Math.sin((t - DEMO_BURNOUT_S) * 0.85)
      roll.value = 14 * Math.sin((t - DEMO_BURNOUT_S) * 1.05)
    } else {
      acc.x = lateral * 0.65 + 0.5 * Math.sin(t * 4.1)
      acc.y = side * 0.55 + 0.45 * Math.cos(t * 3.7)
      acc.z = DEMO_G + aNet
      gyro.x = 22 * Math.sin(t * 2.6) + 14 * Math.sin(t * 5.9)
      gyro.y = 20 * Math.cos(t * 2.2) + 12 * Math.sin(t * 5.1)
      gyro.z = 10 * Math.sin(t * 3.5)
      pitch.value = 68 + 12 * Math.sin((t - DEMO_BURNOUT_S) * 0.95)
      yaw.value = 5 * Math.sin((t - DEMO_BURNOUT_S) * 0.62)
      roll.value = 10 * Math.sin((t - DEMO_BURNOUT_S) * 0.88)
    }

    temperature.value = Math.max(-56.5, demoTempIsaC(rocketMslM))
    pressure.value = demoPressureIsaPa(rocketMslM)

    const xRot = (90 - pitch.value) * deg
    const yRot = yaw.value * deg
    const zRot = roll.value * deg
    quaternion.setFromEuler(new THREE.Euler(xRot, yRot, zRot, 'YXZ'))

    quat_raw.w = quaternion.w
    quat_raw.x = quaternion.x
    quat_raw.y = quaternion.y
    quat_raw.z = quaternion.z
  }

  const startDemoLoop = () => {
    if (demoTimer !== null) return
    demoTimer = window.setInterval(() => {
      if (isDemoMode.value && isLaunched.value) {
        const now = Date.now()
        let dt = (now - lastUpdateTime) / 1000
        if (dt <= 0) return
        if (dt > 0.35) dt = 0.1

        const t = flightTime.value
        let aNet = demoVerticalAccelMs2(t, demoSimState.h, demoSimState.v, demoSimState)

        if (!demoSimState.landed) {
          demoSimState.v += aNet * dt
          demoSimState.h += demoSimState.v * dt
        }

        if (demoSimState.h <= 0 && t >= DEMO_BURNOUT_S) {
          demoSimState.h = 0
          demoSimState.v = 0
          demoSimState.landed = true
          aNet = 0
        }

        const ground = effectiveGroundMsl()
        if (ground !== null) {
          altitudeMsl.value = ground + Math.max(0, demoSimState.h)
          recomputeHeightAboveGround()
        }

        if (!demoSimState.landed) {
          const { ve, vn } = demoWindVelocityMps(t, demoSimState.v, demoSimState)
          demoSimState.driftE += ve * dt
          demoSimState.driftN += vn * dt
          const rm = Math.hypot(demoSimState.driftE, demoSimState.driftN)
          if (rm > DEMO_DRIFT_CAP_M && rm > 0) {
            const sc = DEMO_DRIFT_CAP_M / rm
            demoSimState.driftE *= sc
            demoSimState.driftN *= sc
          }
        }

        padLatitude.value = DEMO_PAD_LAT_DEG
        padLongitude.value = DEMO_PAD_LON_DEG
        const rr = rocketLatLonFromDriftMeters(
          DEMO_PAD_LAT_DEG,
          DEMO_PAD_LON_DEG,
          demoSimState.driftE,
          demoSimState.driftN,
        )
        rocketLatitude.value = rr.lat
        rocketLongitude.value = rr.lon

        applyDemoSensorsAndAttitude(t, altitudeMsl.value, demoSimState.v, aNet, demoSimState)
        processDerivedMetrics()
      } else if (!isLaunched.value) {
          lastUpdateTime = Date.now()
      }
    }, 100)
  }

  // --- 14. 数据同步：模拟=同步地面基准并起飞；实时=同步并开始记录；结束同步停止写入导出表 ---
  const dataSyncAction = () => {
    if (isLaunched.value) return

    syncBriefing.value = null
    syncGroundBaseline()
    flightTime.value = 0
    fullFlightData.splice(0, fullFlightData.length)
    historyData.time = []
    historyData.altitude = []
    historyData.velocity = []
    historyData.temperature = []
    historyData.pressure = []

    if (isDemoMode.value) {
      demoSimState = createDemoSimState()
    }

    isLaunched.value = true
    isFlightRecording.value = true
    lastUpdateTime = Date.now()
    lastHeight = heightAboveGround.value
  }

  /** 结束同步：只停止写入导出样本，画面、任务时间与图表仍继续更新 */
  const endSyncRecording = () => {
    if (!isLaunched.value || !isFlightRecording.value) return
    isFlightRecording.value = false
    syncBriefing.value = buildSyncBriefing(
      fullFlightData as FlightSampleRow[],
      currentStudentName.value,
      isDemoMode.value,
    )
    console.log('⏹ 已结束数据同步：不再写入导出样本，画面与轨迹图仍继续更新')
  }

  const dismissSyncBriefing = () => {
    syncBriefing.value = null
  }

  // --- 15. 系统重置 ---
  const resetAll = () => {
    isLaunched.value = false
    isFlightRecording.value = false
    syncBriefing.value = null
    hasCalibrated.value = false
    flightTime.value = 0
    altitudeMsl.value = isDemoMode.value ? JINAN_MEAN_ELEVATION_M : 0
    groundElevationMsl.value = null
    recomputeHeightAboveGround()
    temperature.value = 20
    pressure.value = 101325
    pitch.value = 0
    yaw.value = 0
    roll.value = 0
    padLatitude.value = DEMO_PAD_LAT_DEG
    padLongitude.value = DEMO_PAD_LON_DEG
    rocketLatitude.value = DEMO_PAD_LAT_DEG
    rocketLongitude.value = DEMO_PAD_LON_DEG
    rocketGpsValid.value = false
    padLocationFromDeviceOk.value = false
    gForce.value = 1.0
    verticalSpeed.value = 0
    velocity.value = 0
    
    acc.x = 0; acc.y = 0; acc.z = 0;
    gyro.x = 0; gyro.y = 0; gyro.z = 0;
    mag.x = 0; mag.y = 0; mag.z = 0;
    quat_raw.w = 1; quat_raw.x = 0; quat_raw.y = 0; quat_raw.z = 0;

    quaternion.set(0, 0, 0, 1)
    zeroQuat.set(0, 0, 0, 1)
    frozenQuat.set(0, 0, 0, 1)
    hasFrozenQuat = false
    lastMotionTs = Date.now()

    historyData.time = []
    historyData.altitude = []
    historyData.velocity = []
    historyData.temperature = []
    historyData.pressure = []

    currentStudentName.value = ''
    fullFlightData.splice(0, fullFlightData.length)
    demoSimState = createDemoSimState()

    lastHeight = 0
    lastUpdateTime = Date.now()
  }

  // --- 16. 导出全量数据 ---
  const exportFlightData = async () => {
    if (fullFlightData.length === 0) {
      alert('暂无飞行数据可导出！')
      return
    }

    const headers = [
      '时间(s)', '海拔MSL(m)', '离地高度AGL(m)', '速度(m/s)',
      '加速度X(G)', '加速度Y(G)', '加速度Z(G)', '角速度X', '角速度Y', '角速度Z',
      '俯仰角(Pitch)', '偏航角(Yaw)', '滚转角(Roll)', '温度(C)', '气压(Pa)',
      '发射架纬度(°)', '发射架经度(°)', '火箭纬度(°)', '火箭经度(°)',
    ]
    const briefing = buildSyncBriefing(
      fullFlightData as FlightSampleRow[],
      currentStudentName.value,
      isDemoMode.value,
    )
    const briefingBlock = briefingToCsvLines(briefing).join('\n')
    const csvRows = fullFlightData.map(row =>
      [
        row.time,
        row.altitudeMsl,
        row.heightAgl,
        row.velocity,
        row.accX,
        row.accY,
        row.accZ,
        row.gyroX,
        row.gyroY,
        row.gyroZ,
        row.pitch,
        row.yaw,
        row.roll,
        row.temperature,
        row.pressure,
        row.padLat,
        row.padLon,
        row.rocketLat,
        row.rocketLon,
      ].join(','),
    )
    const csvContent = '\uFEFF' + [briefingBlock, headers.join(','), ...csvRows].join('\n')
    
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const nameStr = currentStudentName.value.trim() || '未命名选手'
    const fileName = `${dateStr}_${nameStr}_火箭发射数据.csv`

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: csvContent,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })

        await Share.share({
          title: '火箭发射数据',
          text: `选手 ${nameStr} 的火箭发射遥测数据`,
          url: result.uri,
          dialogTitle: '保存或分享飞行数据'
        })
      } catch (e) {
        console.error('原生保存或分享失败', e)
        alert('数据导出失败，请重试')
      }
    } else {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }

  // --- 暴露给组件的状态和函数 ---
  return {
    // 状态
    isLaunched, isFlightRecording, syncBriefing, isDemoMode, isWsConnected,
    flightTime, acc, gyro, mag, quat_raw,
    altitudeMsl, heightAboveGround, groundElevationMsl, hasGroundBaseline,
    altitude, temperature, pressure,
    pitch, yaw, roll, gForce, verticalSpeed, velocity, quaternion, historyData, formattedTime,
    hasCalibrated, showSerialSuccessToast, showSerialErrorToast, serialErrorMessage, currentStudentName, fullFlightData,
    showPadLocationToast, padLocationToastMessage, padLocationFromDeviceOk,
    padLatitude, padLongitude, rocketLatitude, rocketLongitude, rocketGpsValid,
    videoSource, esp32CamHost,
    // 函数
    toggleMode, startDemoLoop, dataSyncAction, endSyncRecording, dismissSyncBriefing, syncGroundBaseline,
    initWindowsSerial, stopSerial, calibrateZero, initAndroidSerial, stopAndroidSerial, resetAll, exportFlightData,
    initPadLocationFromDevice, dismissPadLocationToast,
    setVideoSource, setEsp32CamHost
  }
})