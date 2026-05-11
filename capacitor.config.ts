import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lenghu.rocket',
  appName: '冷湖火箭孪生',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    //url: 'http://192.168.0.184:5173',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: 'CENTER_CROP',
      backgroundColor: '#000000',
      splashFullScreen: true,     // 强行全屏覆盖
      splashImmersive: true       // 隐藏底部虚拟按键
    }
  }
};

export default config;