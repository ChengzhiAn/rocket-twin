import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import * as THREE from 'three'
import { Capacitor } from '@capacitor/core'
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

export const useRocketStore = defineStore('rocket', () => {
  // --- 1. 基础状态 ---
  const isLaunched = ref(false)
  const isDemoMode = ref(true)
  const flightTime = ref(0)
  const isWsConnected = ref(false)
  const showSerialSuccessToast = ref(false);
  
  const sensorIp = ref(localStorage.getItem('rocket_ws_ip') || '192.168.4.1:81')
  let ws: WebSocket | null = null

  let serialPort: any = null;
  let serialReader: any = null;

  // --- 2. 物理数据状态 ---
  const acc = reactive({ x: 0, y: 0, z: 0 })
  const gyro = reactive({ x: 0, y: 0, z: 0 })
  const mag = reactive({ x: 0, y: 0, z: 0 })
  const quat_raw = reactive({ w: 1, x: 0, y: 0, z: 0 })
  
  const altitude = ref(0)
  const temperature = ref(20)
  const pressure = ref(101325)
  const pitch = ref(0)
  const yaw = ref(0)
  const roll = ref(0)

  const gForce = ref(1.0)
  const verticalSpeed = ref(0)
  const velocity = ref(0)
  const quaternion = reactive(new THREE.Quaternion())

  let lastHeight = 0
  let lastUpdateTime = Date.now()

  // --- 3. 归零校准状态 (新增) ---
  const zeroQuat = reactive(new THREE.Quaternion())
  const hasCalibrated = ref(false)

  // --- 4. 历史数据状态 ---
  const historyData = reactive({
    time: [] as string[],
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
    historyData.altitude.push(Number(altitude.value.toFixed(3)))
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
      gForce.value = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.8;
      verticalSpeed.value = (altitude.value - lastHeight) / dt;
      velocity.value = Math.abs(verticalSpeed.value);
      
      if (isLaunched.value) {
        flightTime.value += dt;
        pushToHistory();

        // 记录给导出用的全量数据
        fullFlightData.push({
          time: flightTime.value.toFixed(3),
          altitude: altitude.value.toFixed(3),
          velocity: velocity.value.toFixed(2),
          accX: acc.x.toFixed(2), accY: acc.y.toFixed(2), accZ: acc.z.toFixed(2),
          gyroX: gyro.x.toFixed(2), gyroY: gyro.y.toFixed(2), gyroZ: gyro.z.toFixed(2),
          pitch: pitch.value.toFixed(2), yaw: yaw.value.toFixed(2), roll: roll.value.toFixed(2),
          temperature: temperature.value.toFixed(1),
          pressure: pressure.value.toFixed(0)
        });
      }
      
      lastHeight = altitude.value;
      lastUpdateTime = now;
    }
  };

  // --- 7. 归零校准核心函数 (新增) ---
  const calibrateZero = () => {
    // 记录当前姿态的逆四元数，作为归零偏移
    zeroQuat.copy(quaternion).invert()
    hasCalibrated.value = true
    console.log("✅ 姿态校准完成：当前位置已设为初始零位")
  }

  // --- 8. 基础设置函数 ---
  const setSensorIp = (newIp: string) => {
    sensorIp.value = newIp
    localStorage.setItem('rocket_ws_ip', newIp)
    initWebSocket()
  }

  const toggleMode = () => {
    isDemoMode.value = !isDemoMode.value
  }

  // --- 9. WebSocket 通信逻辑 ---
  const initWebSocket = () => {
    if (ws) ws.close()
    try {
      const wsUrl = `ws://${sensorIp.value}/`
      ws = new WebSocket(wsUrl)
      ws.onopen = () => { isWsConnected.value = true }
      ws.onmessage = (event) => {
        if (!isDemoMode.value) {
          try {
            const data = JSON.parse(event.data)
            processRealData(data)
          } catch (e) { console.error("JSON 解析失败:", e) }
        }
      }
      ws.onerror = () => { isWsConnected.value = false }
      ws.onclose = () => { isWsConnected.value = false; setTimeout(initWebSocket, 3000) }
    } catch (error) { console.error("WS初始化失败:", error) }
  }

  // --- 10. Windows Web Serial 通信逻辑 ---
  const initWindowsSerial = async () => {
    if (!('serial' in navigator)) {
      alert("当前浏览器不支持串口通信，请使用 Chrome 或 Edge 浏览器");
      return;
    }

    try {
      serialPort = await (navigator as any).serial.requestPort();
      await serialPort.open({ baudRate: 115200 });
      isWsConnected.value = true;
      isDemoMode.value = false;

      const decoder = new TextDecoder();
      serialReader = serialPort.readable.getReader();

      let serialBuffer = "";

      console.log("🟢 Windows 串口连接成功，开始解析 LoRa 流...");

      while (true) {
        const { value, done } = await serialReader.read();
        if (done) break;

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
    }
  };

  const stopSerial = async () => {
    if (serialReader) {
      await serialReader.cancel();
      serialReader = null;
    }
    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
    isWsConnected.value = false;
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
      // 1. 等待插件就绪
      await waitForPluginReady();
      
      // 检查插件是否存在
      if (!window.serial) {
        const errMsg = "❌ 串口插件未就绪，请重试";
        console.error(errMsg);
        alert(errMsg);
        return;
      }
      console.log("✅ 串口插件就绪", window.serial);

      // 2. 申请USB权限（这里会100%弹出系统权限请求框）
      console.log("🔵 开始申请USB权限");
      const permissionGranted = await new Promise<boolean>((resolve) => {
        window.serial.requestPermission(
          // 这里不指定vid/pid，自动匹配所有串口设备，适配你的LoRa模块
          {}, 
          // 权限申请成功回调
          () => {
            console.log("✅ USB权限申请成功");
            resolve(true);
          },
          // 权限申请失败回调
          (err: any) => {
            console.error("❌ USB权限申请失败", err);
            alert("USB权限被拒绝，请检查OTG连接后重试");
            resolve(false);
          }
        );
      });

      if (!permissionGranted) return;

      // 3. 打开串口，参数和你的LoRa模块严格匹配
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
          // 串口打开成功
          () => {
            console.log("✅ 串口打开成功");
            resolve(true);
          },
          // 串口打开失败
          (err: any) => {
            console.error("❌ 串口打开失败", err);
            alert("串口打开失败，请检查模块波特率和连接");
            resolve(false);
          }
        );
      });

      if (!openSuccess) return;

      // 4. 连接成功，更新全局状态
      isWsConnected.value = true;
      isDemoMode.value = false;
      console.log("🟢 华为平板USB串口连接成功，开始解析LoRa流...");
      // 替换原来的 alert
      showSerialSuccessToast.value = true;
      // 3秒后自动消失
      setTimeout(() => {
        showSerialSuccessToast.value = false;
      }, 3000);

      let androidBuffer = "";

      // 5. 注册串口数据接收回调，完全匹配插件返回格式
      window.serial.registerReadCallback(
        (data: any) => {
          try {
            // 适配插件返回格式：ArrayBuffer字节数组
            const decodedString = new TextDecoder().decode(new Uint8Array(data));
            console.log("📥 收到串口原始数据:", decodedString);
            
            androidBuffer += decodedString;
            // 按换行符拆分完整数据行，复用你现有的CSV解析逻辑
            if (androidBuffer.includes('\n')) {
              const lines = androidBuffer.split('\n');
              androidBuffer = lines.pop() || ""; // 不完整的行留到下一次处理
              
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
        }
      );

    } catch (globalErr) {
      console.error("❌ 安卓串口全局异常", globalErr);
      isWsConnected.value = false;
      alert("串口连接异常：" + JSON.stringify(globalErr));
    }
  };

  // --- 【最终适配版】安卓串口关闭函数 ---
  const stopAndroidSerial = async () => {
    try {
      if (typeof window !== 'undefined' && window.serial) {
        await new Promise((resolve) => {
          window.serial.close(
            () => {
              console.log("✅ 串口已关闭");
              resolve(true);
            },
            () => {
              console.warn("⚠️ 串口关闭失败");
              resolve(false);
            }
          );
        });
      }
      isWsConnected.value = false;
    } catch (error) {
      console.error("关闭串口失败", error);
      isWsConnected.value = false;
    }
  };


  // --- 11. CSV 数据解析逻辑 (串口用) ---
  const parseCsvData = (line: string) => {
    try {
      const parts = line.split(',').map(v => parseFloat(v.trim()));
      
      if (parts.length < 19 || parts.some(isNaN)) {
        console.warn('CSV数据格式错误，跳过该行:', line);
        return;
      }

      acc.x = parts[0] ?? 0; acc.y = parts[1] ?? 0; acc.z = parts[2] ?? 0;
      gyro.x = parts[3] ?? 0; gyro.y = parts[4] ?? 0; gyro.z = parts[5] ?? 0;
      mag.x = parts[6] ?? 0; mag.y = parts[7] ?? 0; mag.z = parts[8] ?? 0;
      
      quat_raw.w = parts[9] ?? 1;
      quat_raw.x = parts[10] ?? 0;
      quat_raw.y = parts[11] ?? 0;
      quat_raw.z = parts[12] ?? 0;
      
      roll.value = parts[13] ?? 0;
      yaw.value = parts[14] ?? 0;
      pitch.value = parts[15] ?? 0;

      altitude.value = parts[16] ?? 0;
      temperature.value = parts[17] ?? 20;
      pressure.value = parts[18] ?? 101325;

      // 【核心修改】应用归零校准（统一四元数符号，防止双覆盖导致方向反转）
      const rawQuat = new THREE.Quaternion(quat_raw.x, quat_raw.y, quat_raw.z, quat_raw.w)
      if (rawQuat.w < 0) {
        rawQuat.w *= -1
        rawQuat.x *= -1
        rawQuat.y *= -1
        rawQuat.z *= -1
      }
      quaternion.copy(zeroQuat).multiply(rawQuat)

      processDerivedMetrics(); 

    } catch (e) {
      console.warn("解析行失败:", line);
    }
  };

  // --- 12. JSON 数据处理逻辑 (WebSocket用) ---
  const processRealData = (data: any) => {
    acc.x = data.acc_x ?? 0; acc.y = data.acc_y ?? 0; acc.z = data.acc_z ?? 0;
    gyro.x = data.gyro_x ?? 0; gyro.y = data.gyro_y ?? 0; gyro.z = data.gyro_z ?? 0;
    quat_raw.w = data.quat_w ?? 1; quat_raw.x = data.quat_x ?? 0; quat_raw.y = data.quat_y ?? 0; quat_raw.z = data.quat_z ?? 0;
    
    altitude.value = data.height ?? 0;
    temperature.value = data.temperature ?? 20;
    pressure.value = data.pressure ?? 101325;

    const radToDeg = 180 / Math.PI;
    pitch.value = (data.euler_pitch ?? 0) * radToDeg;
    yaw.value = (data.euler_yaw ?? 0) * radToDeg;
    roll.value = (data.euler_roll ?? 0) * radToDeg;

    // 【核心修改】应用归零校准（统一四元数符号，防止双覆盖导致方向反转）
    const rawQuat = new THREE.Quaternion(data.quat_x ?? 0, data.quat_y ?? 0, data.quat_z ?? 0, data.quat_w ?? 1)
    if (rawQuat.w < 0) {
      rawQuat.w *= -1
      rawQuat.x *= -1
      rawQuat.y *= -1
      rawQuat.z *= -1
    }
    quaternion.copy(zeroQuat).multiply(rawQuat)

    processDerivedMetrics();
  }

  // --- 13. Demo 模拟模式逻辑 ---
  let demoTimer: number | null = null
  const startDemoLoop = () => {
    demoTimer = window.setInterval(() => {
      if (isDemoMode.value && isLaunched.value) {
        const now = Date.now()
        const dt = (now - lastUpdateTime) / 1000
        flightTime.value += dt
        
        verticalSpeed.value += 9.8 * dt * 0.5 
        altitude.value += (verticalSpeed.value * dt) / 1000 
        
        velocity.value = Math.abs(verticalSpeed.value) 
        
        temperature.value = Math.max(-50, 20 - altitude.value * 6.5)
        pressure.value = Math.max(0, 101325 * Math.pow(1 - altitude.value / 44.3, 5.25))
        
        pitch.value = Math.max(0, 90 - altitude.value * 3) 
        yaw.value = (Math.random() - 0.5) * 0.5 
        roll.value += 0.1
        
        const xRot = (90 - pitch.value) * (Math.PI / 180)
        const yRot = yaw.value * (Math.PI / 180)
        const zRot = roll.value * (Math.PI / 180)
        quaternion.setFromEuler(new THREE.Euler(xRot, yRot, zRot, 'YXZ'))
        
        gForce.value = 1.2 + Math.random() * 0.2 + (verticalSpeed.value / 600)
        
        pushToHistory()

        lastUpdateTime = now
      } else if (!isLaunched.value) {
          lastUpdateTime = Date.now()
      }
    }, 100)
  }

  // --- 14. 发射控制 ---
  const startLaunch = () => {
    if (isLaunched.value) return
    isLaunched.value = true
    lastUpdateTime = Date.now()
    lastHeight = altitude.value
  }

  // --- 15. 系统重置 ---
  const resetAll = () => {
    isLaunched.value = false
    hasCalibrated.value = false
    flightTime.value = 0
    altitude.value = 0
    temperature.value = 20
    pressure.value = 101325
    pitch.value = 0
    yaw.value = 0
    roll.value = 0
    gForce.value = 1.0
    verticalSpeed.value = 0
    velocity.value = 0
    
    acc.x = 0; acc.y = 0; acc.z = 0;
    gyro.x = 0; gyro.y = 0; gyro.z = 0;
    mag.x = 0; mag.y = 0; mag.z = 0;
    quat_raw.w = 1; quat_raw.x = 0; quat_raw.y = 0; quat_raw.z = 0;

    quaternion.set(0, 0, 0, 1)
    zeroQuat.set(0, 0, 0, 1)

    historyData.time = []
    historyData.altitude = []
    historyData.velocity = []
    historyData.temperature = []
    historyData.pressure = []

    currentStudentName.value = ''
    fullFlightData.splice(0, fullFlightData.length)

    lastHeight = 0
    lastUpdateTime = Date.now()
  }

  // --- 16. 导出全量数据 ---
  const exportFlightData = async () => {
    if (fullFlightData.length === 0) {
      alert('暂无飞行数据可导出！')
      return
    }

    const headers = ['时间(s)', '高度(m)', '速度(m/s)', '加速度X(G)', '加速度Y(G)', '加速度Z(G)', '角速度X', '角速度Y', '角速度Z', '俯仰角(Pitch)', '偏航角(Yaw)', '滚转角(Roll)', '温度(C)', '气压(Pa)']
    const csvRows = fullFlightData.map(row => 
      [row.time, row.altitude, row.velocity, row.accX, row.accY, row.accZ, row.gyroX, row.gyroY, row.gyroZ, row.pitch, row.yaw, row.roll, row.temperature, row.pressure].join(',')
    )
    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n')
    
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
    isLaunched, isDemoMode, sensorIp, isWsConnected,
    flightTime, acc, gyro, mag, quat_raw, altitude, temperature, pressure,
    pitch, yaw, roll, gForce, verticalSpeed, velocity, quaternion, historyData, formattedTime,
    hasCalibrated,  showSerialSuccessToast, currentStudentName, fullFlightData,
    // 函数
    setSensorIp, toggleMode, initWebSocket, startDemoLoop, startLaunch,
    initWindowsSerial, stopSerial, calibrateZero, initAndroidSerial, stopAndroidSerial, resetAll, exportFlightData
  }
})