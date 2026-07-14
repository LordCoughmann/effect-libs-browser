import require$$0 from '../../_virtual/utilsBundleImpl.js';

const colors = require$$0.colors;
const debug = require$$0.debug;
const diff = require$$0.diff;
const dotenv = require$$0.dotenv;
const getProxyForUrl = require$$0.getProxyForUrl;
const HttpsProxyAgent = require$$0.HttpsProxyAgent;
const jpegjs = require$$0.jpegjs;
const lockfile = require$$0.lockfile;
const mime = require$$0.mime;
const minimatch = require$$0.minimatch;
const open = require$$0.open;
const PNG = require$$0.PNG;
const program = require$$0.program;
const ProgramOption = require$$0.ProgramOption;
const progress = require$$0.progress;
const SocksProxyAgent = require$$0.SocksProxyAgent;
const ws = require$$0.ws;
const wsServer = require$$0.wsServer;
const wsReceiver = require$$0.wsReceiver;
const wsSender = require$$0.wsSender;
const yaml = require$$0.yaml;
function ms(ms2) {
  if (!isFinite(ms2))
    return "-";
  if (ms2 === 0)
    return "0ms";
  if (ms2 < 1e3)
    return ms2.toFixed(0) + "ms";
  const seconds = ms2 / 1e3;
  if (seconds < 60)
    return seconds.toFixed(1) + "s";
  const minutes = seconds / 60;
  if (minutes < 60)
    return minutes.toFixed(1) + "m";
  const hours = minutes / 60;
  if (hours < 24)
    return hours.toFixed(1) + "h";
  const days = hours / 24;
  return days.toFixed(1) + "d";
}

export { HttpsProxyAgent, PNG, ProgramOption, SocksProxyAgent, colors, debug, diff, dotenv, getProxyForUrl, jpegjs, lockfile, mime, minimatch, ms, open, program, progress, ws, wsReceiver, wsSender, wsServer, yaml };
