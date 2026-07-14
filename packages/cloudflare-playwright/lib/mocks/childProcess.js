const execSync = () => {
  throw new Error("execSync not implemented");
};
const spawn = () => {
  throw new Error("spawn not implemented");
};
const spawnSync = () => {
  throw new Error("spawnSync not implemented");
};
const fork = () => {
  throw new Error("fork not implemented");
};
const require$$0$5 = {
  execSync,
  spawn,
  spawnSync,
  fork
};

export { require$$0$5 as default, execSync, fork, spawn, spawnSync };
