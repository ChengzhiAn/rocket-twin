/** WGS84 球面近似：射程在数公里内用局部平面足够 */

const EARTH_RADIUS_M = 6_371_000

export type EnOffsetMeters = { eastM: number; northM: number }

/** 发射架 → 火箭：东北向位移（东为正，北为正），单位 m */
export function offsetEnMeters(
  padLatDeg: number,
  padLonDeg: number,
  rocketLatDeg: number,
  rocketLonDeg: number,
): EnOffsetMeters {
  const φ = (padLatDeg * Math.PI) / 180
  const dφ = ((rocketLatDeg - padLatDeg) * Math.PI) / 180
  const dλ = ((rocketLonDeg - padLonDeg) * Math.PI) / 180
  const northM = EARTH_RADIUS_M * dφ
  const eastM = EARTH_RADIUS_M * dλ * Math.cos(φ)
  return { eastM, northM }
}

/** 水平距离（与 offset 一致的定义），单位 m */
export function horizontalDistanceM(
  padLatDeg: number,
  padLonDeg: number,
  rocketLatDeg: number,
  rocketLonDeg: number,
): number {
  const { eastM, northM } = offsetEnMeters(padLatDeg, padLonDeg, rocketLatDeg, rocketLonDeg)
  return Math.hypot(eastM, northM)
}
