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
global.process = global.process || require('process');
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
