const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serialFiles = [
  'node_modules/cordovarduino/src/android/fr/drangies/cordova/serial/Serial.java',
  'android/capacitor-cordova-android-plugins/src/main/java/fr/drangies/cordova/serial/Serial.java',
];

const importBefore = `import android.hardware.usb.UsbManager;
import android.util.Base64;`;

const importAfter = `import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;`;

const blockBefore = `					// create the intent that will be used to get the permission
					PendingIntent pendingIntent = PendingIntent.getBroadcast(cordova.getActivity(), 0, new Intent(UsbBroadcastReceiver.USB_PERMISSION), 0);
					// and a filter on the permission we ask
					IntentFilter filter = new IntentFilter();
					filter.addAction(UsbBroadcastReceiver.USB_PERMISSION);
					// this broadcast receiver will handle the permission results
					UsbBroadcastReceiver usbReceiver = new UsbBroadcastReceiver(callbackContext, cordova.getActivity());
					cordova.getActivity().registerReceiver(usbReceiver, filter);`;

const blockAfter = `					// create the intent that will be used to get the permission
					Intent permissionIntent = new Intent(UsbBroadcastReceiver.USB_PERMISSION);
					permissionIntent.setPackage(cordova.getActivity().getPackageName());
					int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
					if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
						pendingIntentFlags |= PendingIntent.FLAG_MUTABLE;
					}
					PendingIntent pendingIntent = PendingIntent.getBroadcast(cordova.getActivity(), 0, permissionIntent, pendingIntentFlags);
					// and a filter on the permission we ask
					IntentFilter filter = new IntentFilter();
					filter.addAction(UsbBroadcastReceiver.USB_PERMISSION);
					// this broadcast receiver will handle the permission results
					UsbBroadcastReceiver usbReceiver = new UsbBroadcastReceiver(callbackContext, cordova.getActivity());
					if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
						cordova.getActivity().registerReceiver(usbReceiver, filter, Context.RECEIVER_EXPORTED);
					}
					else {
						cordova.getActivity().registerReceiver(usbReceiver, filter);
					}`;

let changedAny = false;

for (const relativeFile of serialFiles) {
  const file = path.join(root, relativeFile);
  if (!fs.existsSync(file)) {
    continue;
  }

  let source = fs.readFileSync(file, 'utf8');
  const originalSource = source;

  if (!source.includes('import android.os.Build;')) {
    source = source.replace(importBefore, importAfter);
  }

  if (source.includes(blockBefore)) {
    source = source.replace(blockBefore, blockAfter);
  } else if (!source.includes('permissionIntent.setPackage(cordova.getActivity().getPackageName())')) {
    throw new Error(`Could not patch cordovarduino PendingIntent in ${relativeFile}`);
  }

  if (source !== originalSource) {
    fs.writeFileSync(file, source);
    changedAny = true;
    console.log(`Patched ${relativeFile}`);
  }
}

if (!changedAny) {
  console.log('cordovarduino PendingIntent patch already applied or source not installed yet.');
}
