// Lightweight canvas adapter around the vendored qrcode-generator library.
// Provides a QRCode.toCanvas(canvas, text, opts, callback) API compatible
// with what the app expects, without any external network dependency.
(function () {
  function toCanvas(canvas, text, opts, callback) {
    opts = opts || {};
    var width = opts.width || 200;
    var margin = typeof opts.margin === 'number' ? opts.margin : 1;
    var dark = (opts.color && opts.color.dark) || '#000000';
    var light = (opts.color && opts.color.light) || '#ffffff';

    try {
      var qr = null;
      var lastErr = null;
      for (var t = 1; t <= 20; t += 1) {
        try {
          var candidate = window.qrcode(t, 'M');
          candidate.addData(String(text || ''));
          candidate.make();
          qr = candidate;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!qr) throw lastErr || new Error('QR encode failed');

      var count = qr.getModuleCount();
      var marginModules = margin * 4; // roughly matches qrcode.js default margin scaling
      var totalModules = count + marginModules * 2;
      var cellSize = width / totalModules;

      canvas.width = width;
      canvas.height = width;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, width, width);
      ctx.fillStyle = dark;

      for (var r = 0; r < count; r += 1) {
        for (var c = 0; c < count; c += 1) {
          if (qr.isDark(r, c)) {
            var x = (c + marginModules) * cellSize;
            var y = (r + marginModules) * cellSize;
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellSize), Math.ceil(cellSize));
          }
        }
      }

      if (typeof callback === 'function') callback(null);
    } catch (e) {
      if (typeof callback === 'function') callback(e);
    }
  }

  window.QRCode = { toCanvas: toCanvas };
})();
