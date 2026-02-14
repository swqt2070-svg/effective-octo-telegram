const notSupported = () => {
  throw new Error('fs is not available in React Native');
};

module.exports = {
  readFileSync: notSupported,
  lstatSync: notSupported,
  statSync: notSupported,
  readdirSync: notSupported,
  renameSync: notSupported,
  unlinkSync: notSupported,
  rmdirSync: notSupported,
  symlinkSync: notSupported,
  readlinkSync: notSupported,
  openSync: notSupported,
  closeSync: notSupported,
  writeSync: notSupported,
  existsSync: () => false,
};
