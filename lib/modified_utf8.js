(function () {

  exports.bytesToString = bytesToString;
  exports.stringToBytes = stringToBytes;

  function bytesToString(bytes) {
    var codePoints = getCodePoints(bytes)
      , chars = [];

    for (var i = 0; i < codePoints.length; ++i) {
      var point = codePoints[i]
        , offset = point - 0x10000
        , units = point > 0xFFFF ? [0xD800 + (offset >> 10), 0xDC00 + (offset & 0x3FF)] : [point];

      chars.push(String.fromCharCode.apply(null, units));
    }
    return chars.join("");
  }

  function stringToBytes(str) {
    throw new Error("Not yet implemented.");
  }

  function getCodePoints(bytes) {
    var codePoints = [];
    for (var i = 0, codePointWidth; i < bytes.length; i += codePointWidth) {

      // Detect the number of bytes the next code point is encoded into.
      if (isOneByte(bytes, i)) codePointWidth = 1;
      else if (isTwoByte(bytes, i)) codePointWidth = 2;
      else if (isSurrogate(bytes, i)) codePointWidth = 6;
      else if (isThreeByte(bytes, i)) codePointWidth = 3;
      else throw new Error("unrecognisable modified-utf8 sequence.");

      var a = bytes[i];
      if (codePointWidth === 1) {
        codePoints.push(a);
        continue;
      }

      var b = bytes[++i];
      if (codePointWidth === 2) {
        codePoints.push(((a & 0x1F) << 6) | (b & 0x3F));
        continue;
      }

      var c = bytes[++i];
      if (codePointWidth === 3) {
        codePoints.push(((a & 0x0F) << 12) | ((b & 0x3F) << 6) | (c & 0x3F));
        continue;
      }

      var d = bytes[++i], e = bytes[++i], f = bytes[++i];
      codePoints.push(0x10000 | ((b & 0x0f) << 16) | ((c & 0x3f) << 10) | ((e & 0x0f) << 6) | (f & 0x3f));
    }

    return codePoints;
  }

  function isSurrogate(bytes, index) {
    if ((index + 5) >= bytes.length) return false;

    return (bytes[index] === 0xED)
      && ((bytes[index + 1] >>> 4) === 0x0A)
      && ((bytes[index + 2] >>> 6) === 0x02)
      && ((bytes[index + 3] === 0xED))
      && ((bytes[index + 4] >>> 4) === 0x0B)
      && ((bytes[index + 5] >>> 6) === 0x02);
  }

  function isThreeByte(bytes, index) {
    if ((index + 2) >= bytes.length) return false;

    return ((bytes[index] >>> 4) === 0x0E)
      && ((bytes[index + 1] >>> 6) === 0x02)
      && ((bytes[index + 2] >>> 6) === 0x02);
  }

  function isTwoByte(bytes, index) {
    if ((index + 1) >= bytes.length) return false;

    return ((bytes[index] >>> 5) === 0x06)
      && ((bytes[index + 1] >>> 6) === 0x02);
  }

  function isOneByte(bytes, index) {
    return (bytes[index] >>> 7) === 0x0;
  }
}());
