/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'text-encoding';
import { Buffer } from 'buffer';
import { decode as atob, encode as btoa } from 'base-64';
import crypto from 'react-native-quick-crypto';

global.Buffer = Buffer;
global.crypto = crypto;
global.atob = global.atob || atob;
global.btoa = global.btoa || btoa;
const processShim = global.process || require('process');
processShim.env = processShim.env || {};
processShim.argv = processShim.argv || [];
processShim.platform = processShim.platform || 'android';
processShim.on = processShim.on || (() => processShim);
processShim.addListener = processShim.addListener || processShim.on;
processShim.removeListener = processShim.removeListener || (() => processShim);
processShim.emit = processShim.emit || (() => false);
global.process = processShim;
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
