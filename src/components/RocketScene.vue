<template>
  <div ref="container" class="scene-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useRocketStore } from '../store/rocket'
import { SplashScreen } from '@capacitor/splash-screen';

const rocketStore = useRocketStore()

// 获取 DOM 容器
const container = ref<HTMLElement | null>(null)

// Three.js 核心变量
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number
let starSystem: THREE.Points // 🌃星空系统变量

// 新增大组和基础位置记录
let rocketGroup: THREE.Group 
let rocketModel: THREE.Group | null = null
let basePos = new THREE.Vector3() 

// 参数化配置中心 (改这一个，其他的自动按比例适应)
const TARGET_HEIGHT = 10 // 🚀 你想要调整的火箭总高度
const NOZZLE_Y = -(TARGET_HEIGHT / 2) + (TARGET_HEIGHT * 0.025) -0.5// 喷口Y坐标 (算出来如果是20就是-9.5，微微靠上咬合)
const NOZZLE_WIDTH = TARGET_HEIGHT * 0.015 // 喷口宽度 (控制火焰初始生成的X/Z范围)
const PARTICLE_SIZE = TARGET_HEIGHT * 0.075 // 粒子大小 (火箭变大，火花也要跟着变大)
const FLAME_SPEED = TARGET_HEIGHT * 0.01 // 喷射速度的基准倍率
const FLAME_SPEED_REF_MPS = 105 // 参考箭速 (m/s)，用于把遥测 verticalSpeed 映射到尾焰强度
/** 遥测离地高度 (m) → 地球沿场景 Y 位移。火箭保持原位，地球下移体现升空；着陆时地球回到基准 */
const ALTITUDE_TO_EARTH_SHIFT = 0.52

// 🔥尾焰粒子系统的核心变量
const particleCount = 2000 // 2000个粒子，足够饱满且不卡
let particleGeometry: THREE.BufferGeometry
let particleSystem: THREE.Points
let particleMaterial: THREE.PointsMaterial | null = null
let flameScaleSmoothed = 0
// 记录每个粒子的生命周期和下落速度
const particleData: { velocity: THREE.Vector3, life: number, maxLife: number }[] =[]

// 3D场景 🌟
const initThree = () => {
  if (!container.value) return
  const width = container.value.clientWidth
  const height = container.value.clientHeight

  // 1. 初始化场景
  scene = new THREE.Scene()

  // 初始化大组
  rocketGroup = new THREE.Group()
  scene.add(rocketGroup)

  // 稍微加点背景雾化效果，看起来更深邃 ⚠️
  scene.fog = new THREE.FogExp2(0x0b0f19, 0.02) 

  // 2. 初始化相机
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20000)
  camera.position.set(0, 5, 20) // 相机放在稍微偏上偏前的位置
  scene.add(camera) // 把相机加入场景，这样才能在相机上绑灯

  // 3. 初始化渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) // alpha=true 允许背景透明
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  container.value.appendChild(renderer.domElement)

  // 4. 添加灯光 (确保只有这一块，不要有重复的)
  const ambientLight = new THREE.AmbientLight(0xffffff, 2.0) 
  scene.add(ambientLight)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 3) 
  directionalLight.position.set(5, 10, 10)
  camera.add(directionalLight)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  //hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2)
  //hemiLight.position.set(0, 20, 0)
  //scene.add(hemiLight)

  // 加个双保险：如果 3.5 秒后模型还没加载完，强行关闭启动页，防止卡死
  setTimeout(() => {
    SplashScreen.hide({ fadeOutDuration: 500 });
  }, 3500);

  // 6. 加载 3D 模型
  const loader = new GLTFLoader()

  loader.load(
    `${import.meta.env.BASE_URL}models/rocket.glb`, // 你的模型路径
    (gltf) => {
      // --- 1. 获取加载进来的原始场景 ---
      const loadedScene = gltf.scene 

      // --- 2. 计算包围盒进行自动居中与缩放 ---
      const box = new THREE.Box3().setFromObject(loadedScene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())

      // 计算缩放比例
      const scaleRatio = TARGET_HEIGHT / size.y 
      loadedScene.scale.set(scaleRatio, scaleRatio, scaleRatio)

      // 【核心修改】：移动 loadedScene，使其几何中心位于坐标原点 (0,0,0)
      // 这样旋转时，火箭才会绕着自己的肚子转，而不是绕着脚底转
      loadedScene.position.set(
        -center.x * scaleRatio,
        -center.y * scaleRatio,
        -center.z * scaleRatio
      )

      // --- 3. 创建一个校准组 (或者叫 Pivot 轴心组) ---
      // 我们把调整好的 loadedScene 放入这个组
      const pivotGroup = new THREE.Group()
      pivotGroup.add(loadedScene)
    
      // 【关键点】：将这个组赋值给全局变量 rocketModel，供 animate 函数使用
      // 以后 animate 里的四元数旋转就是作用在 pivotGroup 上的
      rocketModel = pivotGroup 

      if (particleSystem) {
        rocketModel.add(particleSystem)
      }      

      // 记录基础位置，防止动画时跑偏
      basePos.copy(rocketModel.position)

      // 最后将整个处理好的模型加入大场景组
      rocketGroup.add(rocketModel)

       SplashScreen.hide({
        fadeOutDuration: 500 // 500毫秒淡出动画，视觉上最舒缓
      });
    },
    (xhr) => {
      console.log(`模型加载进度: ${(xhr.loaded / xhr.total) * 100}%`)
    },
    (error) => {
      console.error('模型加载失败', error)
    }
  )

  // 监听窗口大小变化
  window.addEventListener('resize', onWindowResize)
  // 🔥粒子火焰：
  initParticles()
  // 🌃 星空
  initBackground() 
  window.addEventListener('resize', onWindowResize)
  // 开始渲染循环
  animate()
}

// 🔥初始化粒子尾焰
const initParticles = () => {
  particleGeometry = new THREE.BufferGeometry()
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const color = new THREE.Color()

  for (let i = 0; i < particleCount; i++) {
    // 初始全部藏在火箭底部中心 (我们之前设定火箭高20，居中后底部大约在 y = -10)
    positions[i * 3] = 0
    positions[i * 3 + 1] = NOZZLE_Y // 使用动态的喷口Y坐标 
    positions[i * 3 + 2] = 0

    // 生成火焰颜色：核心是黄色(1,1,0)，边缘是橙红(1, 0.4, 0)
    color.setRGB(1, Math.random() * 0.3, 0)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    // 随机分配每个粒子的速度和寿命
    particleData.push({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02, // X轴向外侧扩散
        -Math.random() * (FLAME_SPEED) - (FLAME_SPEED * 0.5), // 使用动态倍率控制喷射速度
        (Math.random() - 0.5) * 0.02  // Z轴向外侧扩散
      ),
      life: Math.random(),
      maxLife: 0.3 + Math.random() * 0.4
    })
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  // 用 Canvas 动态画一个边缘模糊的圆，充当粒子的发光贴图
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(8, 8, 0, 8, 8, 8)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 16, 16)
  const texture = new THREE.CanvasTexture(canvas)

  // 粒子材质：开启 AdditiveBlending (加性混合)，粒子重叠的地方会变得极亮，产生真实光晕
  particleMaterial = new THREE.PointsMaterial({
    size: PARTICLE_SIZE, // 使用动态的粒子大小
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false, // 保证发光材质不遮挡
    transparent: true,
    vertexColors: true
  })

  particleSystem = new THREE.Points(particleGeometry, particleMaterial)
  particleSystem.visible = false // 发射前先隐藏
  // 把火焰加进大组！它就会跟着组一起飞
  // rocketGroup.add(particleSystem) 
}

// 🌃 创建星空与真实贴图地球
const initBackground = () => {
  // --- 1. 浩瀚星空 (保持不变) ---
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 3000; // 增加数量，让星空更丰富
  const starPositions: number[] = [];
  
  // 核心参数：球壳半径
  // 地球半径是 2000，我们将星空设在 8000 之外，确保星空极远，产生宏大的空间感
  const starSphereRadius = 8000; 

  for (let i = 0; i < starCount; i++) {
    // 使用球面坐标随机分布，确保 360 度全方位覆盖
    const theta = Math.random() * Math.PI * 2; // 水平环绕 0 到 360 度
    const phi = Math.acos((Math.random() * 2) - 1); // 垂直分布 0 到 180 度，这种分布在球面上更均匀

    // 将球面坐标转换为 XYZ 坐标
    const x = starSphereRadius * Math.sin(phi) * Math.cos(theta);
    const y = starSphereRadius * Math.sin(phi) * Math.sin(theta);
    const z = starSphereRadius * Math.cos(phi);

    starPositions.push(x, y, z);
  }

  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));

  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 5,           // 距离变远了，size 也要相应调大（或者关闭 sizeAttenuation）
    sizeAttenuation: true, // 开启尺寸衰减，模拟远近感
    transparent: true,
    opacity: 0.9,
    fog: false,        // 关键：背景星空不受场景雾化影响
    blending: THREE.AdditiveBlending
  });

  starSystem = new THREE.Points(starGeometry, starMaterial);
  // 确保星空在渲染管线的最底层，且不写入深度缓冲区（防止和后续透明物体冲突）
  starSystem.renderOrder = -1;
  scene.add(starSystem);

  // --- 地球逻辑保持不变 ---
  const earthRadius = 2000;
  const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
  const textureLoader = new THREE.TextureLoader();
  const earthTexture = textureLoader.load(`${import.meta.env.BASE_URL}models/earth.jpg`);
  earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const earthMaterial = new THREE.MeshStandardMaterial({
    map: earthTexture,
    roughness: 0.9,
    metalness: 0.1,
    color: 0xcccccc,
    fog: false
  });
  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.position.set(0, -earthRadius - 150, -150); 
  earth.rotation.x = -Math.PI / 6; 
  earth.rotation.y = Math.PI / 4;
  rocketGroup.userData.earth = earth
  rocketGroup.userData.earthBasePos = earth.position.clone()
  scene.add(earth);

  // --- 3. 极薄的大气层边缘光晕 ---
  // 半径只比地球大 1 个单位，形成一条极致纤细锐利的青色边缘！
  const atmosGeometry = new THREE.SphereGeometry(earthRadius + 1, 64, 64)
  const atmosMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff, 
    transparent: true,
    opacity: 0.3, 
    blending: THREE.AdditiveBlending, 
    side: THREE.BackSide, 
    depthWrite: false, 
    fog: false
  })
  const atmosphere = new THREE.Mesh(atmosGeometry, atmosMaterial)
  atmosphere.position.copy(earth.position)
  rocketGroup.userData.atmosphere = atmosphere
  scene.add(atmosphere)

  // --- 4. 太阳补光（灵魂！） ---
  // 给地球打一束远方的太阳光，制造出明暗交界线（晨昏圈），立体感瞬间爆炸
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0)
  sunLight.position.set(200, 100, -50)
  scene.add(sunLight)

}


// 动画循环
const animate = () => {
  animationId = requestAnimationFrame(animate)

  // 极轻微的旋转，模拟宇宙的动态，同时让星星在像素间微弱跳动产生闪烁感
  if (starSystem) {
  starSystem.rotation.y += 0.0001;
  starSystem.rotation.x += 0.00005;
  }

  // 让地球极度缓慢地自转，增加大片感
  if (rocketGroup && rocketGroup.userData.earth) {
    rocketGroup.userData.earth.rotation.y += 0.0002
  }

  // 以地球为参照：高度变化移动地球与大气层；火箭保持原点，orbit 注视火箭
  rocketGroup.position.set(0, 0, 0)
  controls.target.copy(rocketGroup.position)

  const earthMesh = rocketGroup.userData.earth as THREE.Mesh | undefined
  const earthBase = rocketGroup.userData.earthBasePos as THREE.Vector3 | undefined
  const atmosMesh = rocketGroup.userData.atmosphere as THREE.Mesh | undefined
  if (earthMesh && earthBase) {
    const shift = Math.max(0, rocketStore.heightAboveGround) * ALTITUDE_TO_EARTH_SHIFT
    earthMesh.position.set(earthBase.x, earthBase.y - shift, earthBase.z)
    if (atmosMesh) atmosMesh.position.copy(earthMesh.position)
  }
  
  if (rocketModel) {
    // 1. 姿态平滑同步 (四元数) — 修复双覆盖：确保 slerp 走短弧
    const targetQuat = rocketStore.quaternion.clone()
    if (rocketModel.quaternion.dot(targetQuat) < 0) {
      targetQuat.w *= -1
      targetQuat.x *= -1
      targetQuat.y *= -1
      targetQuat.z *= -1
    }
    rocketModel.quaternion.slerp(targetQuat, 0.2)
    // 2. 尾焰粒子更新（强度随箭体向上速度 verticalSpeed 同步，弹道下降/伞降时关闭）
    const launched = rocketStore.isLaunched
    const vs = rocketStore.verticalSpeed
    const gf = rocketStore.gForce
    let flameTarget = 0
    if (launched && gf > 1.12 && vs > 3) {
      flameTarget = THREE.MathUtils.clamp(vs / FLAME_SPEED_REF_MPS, 0.22, 2.35)
    } else if (launched && gf > 1.35 && vs >= 0 && vs <= 8) {
      flameTarget = 0.32
    }
    flameScaleSmoothed += (flameTarget - flameScaleSmoothed) * 0.14

    if (launched) {
      if (particleSystem && particleGeometry && particleMaterial) {
        const showFlame = flameScaleSmoothed > 0.06
        particleSystem.visible = showFlame

        if (showFlame) {
          particleMaterial.size =
            PARTICLE_SIZE * (0.72 + 0.38 * Math.min(flameScaleSmoothed, 1.6))
        }

        // 获取 position 属性
        const posAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
        
        if (posAttr) {
          const f = flameScaleSmoothed
          for (let i = 0; i < particleCount; i++) {
            const data = particleData[i];
            if (!data || !data.velocity) continue;

            data.life -= 0.025;

            if (data.life <= 0) {
              data.life = data.maxLife;
              data.velocity.set(
                (Math.random() - 0.5) * 0.02,
                -Math.random() * FLAME_SPEED - FLAME_SPEED * 0.5,
                (Math.random() - 0.5) * 0.02
              )
              // 官方推荐用法：直接设置第 i 个粒子的 X, Y, Z
              posAttr.setXYZ(
                i, 
                (Math.random() - 0.5) * NOZZLE_WIDTH, 
                NOZZLE_Y, 
                (Math.random() - 0.5) * NOZZLE_WIDTH
              );
            } else {
              // 官方推荐用法：先获取当前的 X, Y, Z，加上速度（按箭速倍率缩放）
              let currentX = posAttr.getX(i) + data.velocity.x * f;
              let currentY = posAttr.getY(i) + data.velocity.y * f;
              let currentZ = posAttr.getZ(i) + data.velocity.z * f;

              // 火苗收缩塑形
              currentX *= 0.95;
              currentZ *= 0.95;

              // 再写回属性中
              posAttr.setXYZ(i, currentX, currentY, currentZ);
            }
          }
          // 标记需要更新到 GPU
          posAttr.needsUpdate = true;
        }
      } 
    } else {
      flameScaleSmoothed = 0
      if (particleSystem) {
        particleSystem.visible = false;
      }
    }
  }
  
  controls.update()
  renderer.render(scene, camera)
}

// 处理容器自适应
const onWindowResize = () => {
  if (!container.value) return
  const width = container.value.clientWidth
  const height = container.value.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

onMounted(() => {
  initThree()
})

onBeforeUnmount(() => {
  // 组件销毁时清理内存，防止内存泄漏
  window.removeEventListener('resize', onWindowResize)
  cancelAnimationFrame(animationId)
  renderer.dispose()
})
</script>

<style scoped>
.scene-container {
  width: 100%;
  height: 100%;
}
</style>