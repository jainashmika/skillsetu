// File uploads (resumes, logos, documents). Memory storage with strict size/type limits; files are
// written with random names. Logos are public, resumes and documents are private.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { randomToken } = require('../utils/crypto');
const { E } = require('../utils/errors');

const pub = path.join(config.uploadDir, 'public');
const priv = path.join(config.uploadDir, 'private');
fs.mkdirSync(pub, { recursive: true }); fs.mkdirSync(priv, { recursive: true });

const TYPES = {
  resume: { ext: ['.pdf', '.docx', '.txt'], max: 5 },
  image: { ext: ['.png', '.jpg', '.jpeg', '.webp', '.svg'], max: 2 },
  document: { ext: ['.pdf', '.png', '.jpg', '.jpeg'], max: 5 },
};
const uploader = (kind) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TYPES[kind].max * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!TYPES[kind].ext.includes(ext)) return cb(E.bad(`Allowed file types: ${TYPES[kind].ext.join(', ')}`));
    cb(null, true);
  },
}).single('file');

function store(file, visibility = 'private') {
  const ext = path.extname(file.originalname).toLowerCase();
  const name = `${Date.now()}-${randomToken(9)}${ext}`;
  fs.writeFileSync(path.join(visibility === 'public' ? pub : priv, name), file.buffer);
  return visibility === 'public' ? `/uploads/${name}` : name;
}
const privatePath = (name) => path.join(priv, path.basename(name));
module.exports = { uploader, store, privatePath, publicDir: pub };
