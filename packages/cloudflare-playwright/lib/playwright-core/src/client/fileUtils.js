const fileUploadSizeLimit = 50 * 1024 * 1024;
async function mkdirIfNeeded(platform, filePath) {
  await platform.fs().promises.mkdir(platform.path().dirname(filePath), { recursive: true }).catch(() => {
  });
}

export { fileUploadSizeLimit, mkdirIfNeeded };
