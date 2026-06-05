const errorHandler = (err, req, res, next) => {
  console.error('❌ Xato:', err.stack);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Bu ma\'lumot allaqachon mavjud' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Bog\'liq ma\'lumot topilmadi' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Noto\'g\'ri ma\'lumot formati' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Server xatosi yuz berdi',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

const notFound = (req, res) => {
  res.status(404).json({ error: `Yo'l topilmadi: ${req.method} ${req.path}` });
};

module.exports = { errorHandler, notFound };
