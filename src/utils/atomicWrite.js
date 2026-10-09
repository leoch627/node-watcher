const fs = require('fs');
const path = require('path');

// Write to a temporary file in the same directory, flush it, then rename it over the target.
// A crash or power loss leaves either the old file or the new file, never a half-written one.
function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw error;
  }
}

module.exports = { writeFileAtomic };
